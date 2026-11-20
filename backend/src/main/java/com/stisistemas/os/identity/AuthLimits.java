package com.stisistemas.os.identity;

import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The brakes on sign-in (N-30) and on the work of checking a password.
 *
 * <ul>
 *   <li>Rule 13: with 5 failed attempts in 15 minutes an email is blocked for 15 minutes, whether or not an account
 *       exists. While it lasts even the right password is refused, with the same answer for both. A right sign-in
 *       sets the count to zero, and recovering the password by email lifts the block.</li>
 *   <li>Rule 14: at most N password checks at the same time (sign-in, change and recovery). The rest get 429
 *       straight away, so a burst cannot take the shared server. N is 4 unless the optional variable says other
 *       (D-161).</li>
 * </ul>
 *
 * Everything lives in memory (D-159). The account log learns of a block only when the account exists, and that
 * write happens after the answer has gone, so it does not make the answer slower for an account that exists.
 */
@Component
public class AuthLimits {
    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(15);
    static final Duration BLOCK = Duration.ofMinutes(15);
    static final int CAPACITY = 10_000;
    private static final Logger log = LoggerFactory.getLogger(AuthLimits.class);

    private final Clock clock;
    private final JdbcTemplate jdbc;
    private final Accounts accounts;
    private final Throttle failures;
    private final Map<String, Long> blockedUntil = new LinkedHashMap<>();
    private final Semaphore permits;
    private final int maxConcurrent;
    private final ExecutorService audit = Executors.newSingleThreadExecutor(runnable -> {
        var thread = new Thread(runnable, "account-audit");
        thread.setDaemon(true);
        return thread;
    });

    public AuthLimits(Clock clock, JdbcTemplate jdbc, Accounts accounts,
                      @Value("${sti.auth.max-concurrent-checks:4}") int maxConcurrent) {
        this.clock = clock;
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.failures = new Throttle(clock, CAPACITY);
        this.maxConcurrent = Math.max(1, maxConcurrent);
        this.permits = new Semaphore(this.maxConcurrent);
        log.info("Tope de comprobaciones de contraseña al mismo tiempo: {}", this.maxConcurrent);
    }

    public int maxConcurrent() { return maxConcurrent; }

    // ---------------------------------------------------------------------------------------------- rule 13

    public synchronized boolean blocked(String typedEmail) {
        String key = Throttle.key(typedEmail);
        Long until = blockedUntil.get(key);
        if (until == null) return false;
        if (until > clock.millis()) return true;
        blockedUntil.remove(key);
        return false;
    }

    /** Counts a failed attempt. True when this one is the one that starts the block. */
    public boolean failed(String typedEmail) {
        String key = Throttle.key(typedEmail);
        if (failures.hit(key, WINDOW) < MAX_FAILURES) return false;
        failures.clear(key);
        synchronized (this) {
            long now = clock.millis();
            blockedUntil.remove(key);
            blockedUntil.put(key, now + BLOCK.toMillis());
            blockedUntil.values().removeIf(until -> until <= now);
            var oldest = blockedUntil.keySet().iterator();
            while (blockedUntil.size() > CAPACITY && oldest.hasNext()) { oldest.next(); oldest.remove(); }
        }
        String email = typedEmail == null ? "" : typedEmail.trim().toLowerCase(Locale.ROOT);
        audit.execute(() -> recordBlock(email));
        return true;
    }

    public void succeeded(String typedEmail) { failures.clear(Throttle.key(typedEmail)); }

    /** Recovering the password by email lifts the block and the count (rule 6). */
    public synchronized void lift(String typedEmail) {
        String key = Throttle.key(typedEmail);
        failures.clear(key);
        blockedUntil.remove(key);
    }

    private void recordBlock(String email) {
        try {
            var ids = jdbc.queryForList("SELECT id FROM sti.app_user WHERE email = ?", UUID.class, email);
            // D-158: the actor is the account itself, and the text says it was for failed attempts, nothing more.
            for (var id : ids) accounts.log(id, id, "BLOQUEO_INGRESO", Map.of("motivo", "INTENTOS_FALLIDOS", "minutos", 15));
        } catch (RuntimeException failure) {
            log.warn("No se pudo anotar un bloqueo de ingreso: {}", failure.getClass().getSimpleName());
        }
    }

    // ---------------------------------------------------------------------------------------------- rule 14

    /** False when the server is already doing as many checks as allowed. */
    public boolean tryCheck() { return permits.tryAcquire(); }

    public void endCheck() { permits.release(); }

    @PreDestroy void stop() { audit.shutdown(); }
}
