package com.stisistemas.os.mail;

import com.stisistemas.os.identity.PasswordRecovery;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.util.HtmlUtils;

/**
 * The queue of recovery mails (D-38, rule 11). Persistent: the rows are in the database and survive a restart.
 *
 * <ul>
 *   <li>It sends one row at a time, holding its lock while it does. If the process dies halfway, the row goes back
 *       to waiting and the link of a mail that may have left is dead, because its token is saved only after the
 *       mail went out. The next try sends a new one.</li>
 *   <li>A failed send is retried with a growing wait, up to a maximum of tries. A row that could not go out within
 *       60 minutes is dropped and says so.</li>
 *   <li>Own ceiling on sending: 30 an hour and 200 a day, below the mailbox's 50 and 300, which it shares.</li>
 *   <li>Whatever fails here never reaches the person: the request already answered.</li>
 *   <li>It writes down every attempt with account, kind, attempt number, result and time. Never the link or the
 *       token, and never the text of the mail server's answer: only the class of the failure.</li>
 * </ul>
 */
@Component
public class RecoveryMailWorker {
    static final int MAX_PER_HOUR = 30;
    static final int MAX_PER_DAY = 200;
    static final int MAX_ATTEMPTS = 6;
    static final Duration GIVE_UP_AFTER = Duration.ofMinutes(60);
    static final int LINK_MINUTES = 30;
    static final String SUBJECT = "Recuperar tu contraseña de STI-OS";
    private static final Logger log = LoggerFactory.getLogger(RecoveryMailWorker.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Mailer mailer;
    private final long retryBaseSeconds;
    private volatile long lastPurge;

    public RecoveryMailWorker(JdbcTemplate jdbc, TransactionTemplate tx, Mailer mailer,
                              @Value("${sti.mail.retry-base-seconds:60}") long retryBaseSeconds) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.mailer = mailer;
        this.retryBaseSeconds = Math.max(1, retryBaseSeconds);
        log.info("Correo de recuperación: {}", mailer.configured() ? "configurado" : "correo no configurado");
    }

    @Scheduled(fixedDelayString = "${sti.mail.poll-ms:5000}", initialDelayString = "${sti.mail.poll-ms:5000}")
    public void tick() {
        try {
            processDue();
            purge();
        } catch (RuntimeException failure) {
            log.warn("La cola de correos no pudo trabajar: {}", failure.getClass().getSimpleName());
        }
    }

    /** Sends what is due, one row at a time. Public so that tests do not have to wait for the clock. */
    public int processDue() {
        int done = 0;
        while (done < 20 && Boolean.TRUE.equals(tx.execute(status -> processOne()))) done++;
        return done;
    }

    private record Row(UUID id, UUID accountId, int attempts, boolean expired) {}
    private record Person(String name, String email, boolean enabled) {}

    /** True when it handled a row (sent, dropped, or put off), false when nothing was due. */
    private boolean processOne() {
        List<Row> due = jdbc.query("SELECT id, account_id, attempts, created_at < clock_timestamp() - make_interval(mins => ?) AS expired "
            + "FROM sti.mail_outbox WHERE status = 'PENDIENTE' AND next_attempt_at <= clock_timestamp() "
            + "ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
            (rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getObject("account_id", UUID.class),
                rs.getInt("attempts"), rs.getBoolean("expired")), (int) GIVE_UP_AFTER.toMinutes());
        if (due.isEmpty()) return false;
        Row row = due.get(0);

        if (row.expired()) { finish(row, "DESCARTADO", "VENCIDO"); log.info("Correo descartado: no salió en 60 minutos (cuenta {})", row.accountId()); return true; }
        var people = jdbc.query("SELECT display_name, email, enabled FROM sti.app_user WHERE id = ?",
            (rs, n) -> new Person(rs.getString(1), rs.getString(2), rs.getBoolean(3)), row.accountId());
        if (people.isEmpty() || !people.get(0).enabled()) { finish(row, "OMITIDO", "CUENTA_INACTIVA"); return true; }
        Person person = people.get(0);
        if (Mailer.reservedDomain(person.email())) { finish(row, "OMITIDO", "DOMINIO_RESERVADO"); return true; }
        if (!mailer.configured()) {
            finish(row, "OMITIDO", "CORREO_NO_CONFIGURADO");
            log.warn("Correo de recuperación omitido: correo no configurado");
            return true;
        }
        if (sentSince("1 hour") >= MAX_PER_HOUR || sentSince("1 day") >= MAX_PER_DAY) {
            // The ceiling is the server's own: the row waits and the 60 minutes keep running.
            jdbc.update("UPDATE sti.mail_outbox SET next_attempt_at = clock_timestamp() + interval '1 minute' WHERE id = ?", row.id());
            log.warn("Tope de envío alcanzado: el correo espera");
            return true;
        }

        int attempt = row.attempts() + 1;
        String token = PasswordRecovery.newToken();
        String result = "ENVIADO";
        try {
            String link = mailer.publicUrl() + "/nueva-contrasena#" + token;
            mailer.send(person.email(), SUBJECT, text(person.name(), link), html(person.name(), link));
        } catch (Exception failure) {
            result = failureClass(failure);
        }
        jdbc.update("INSERT INTO sti.mail_attempt (id, outbox_id, account_id, kind, attempt, result) VALUES (?, ?, ?, 'RECUPERACION', ?, ?)",
            UUID.randomUUID(), row.id(), row.accountId(), attempt, result);
        log.info("Correo de recuperación: cuenta={} intento={} resultado={}", row.accountId(), attempt, result);

        if ("ENVIADO".equals(result)) {
            // The token is saved only now, once the mail is out: 30 minutes count from here, and the earlier links die.
            jdbc.update("UPDATE sti.password_reset_token SET revoked_at = clock_timestamp() "
                + "WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL", row.accountId());
            jdbc.update("INSERT INTO sti.password_reset_token (id, account_id, outbox_id, token_hash, expires_at) "
                + "VALUES (?, ?, ?, ?, clock_timestamp() + make_interval(mins => ?))",
                UUID.randomUUID(), row.accountId(), row.id(), PasswordRecovery.hash(token), LINK_MINUTES);
            jdbc.update("UPDATE sti.mail_outbox SET attempts = ?, status = 'ENVIADO', finished_at = clock_timestamp() WHERE id = ?", attempt, row.id());
        } else if (attempt >= MAX_ATTEMPTS) {
            jdbc.update("UPDATE sti.mail_outbox SET attempts = ? WHERE id = ?", attempt, row.id());
            finish(row, "DESCARTADO", "MAXIMO_DE_INTENTOS");
        } else {
            long wait = Math.min(retryBaseSeconds << (attempt - 1), 15 * 60);
            jdbc.update("UPDATE sti.mail_outbox SET attempts = ?, next_attempt_at = clock_timestamp() + make_interval(secs => ?) WHERE id = ?",
                attempt, (double) wait, row.id());
        }
        return true;
    }

    private void finish(Row row, String status, String reason) {
        jdbc.update("UPDATE sti.mail_outbox SET status = ?, reason = ?, finished_at = clock_timestamp() WHERE id = ?", status, reason, row.id());
    }

    private int sentSince(String interval) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM sti.mail_attempt WHERE result = 'ENVIADO' "
            + "AND occurred_at > clock_timestamp() - CAST(? AS interval)", Integer.class, interval);
        return count == null ? 0 : count;
    }

    /** Only the class of the failure is kept: the text of an error can carry the server's name or worse. */
    static String failureClass(Throwable failure) {
        Throwable root = failure;
        for (int depth = 0; root.getCause() != null && root.getCause() != root && depth < 8; depth++) root = root.getCause();
        String name = root.getClass().getSimpleName();
        return name.isEmpty() ? "ERROR" : name.substring(0, Math.min(name.length(), 80));
    }

    /** Old rows that never sent anything are not kept for ever; the ones that were sent stay. */
    private void purge() {
        long now = System.currentTimeMillis();
        if (now - lastPurge < Duration.ofHours(1).toMillis()) return;
        lastPurge = now;
        int removed = jdbc.update("DELETE FROM sti.mail_outbox WHERE status IN ('OMITIDO', 'DESCARTADO') "
            + "AND finished_at < clock_timestamp() - interval '30 days'");
        if (removed > 0) log.info("Registro de pedidos de recuperación: {} filas viejas retiradas", removed);
    }

    // ---------------------------------------------------------------------------------------------- the message

    static String text(String name, String link) {
        return "Hola, " + name + ". Pediste elegir una contraseña nueva para STI-OS. "
            + "Usá este enlace en los próximos 30 minutos:\n\n" + link + "\n\n"
            + "Sirve una sola vez. Si no lo pediste, ignorá este correo: tu contraseña no cambia.\n";
    }

    static String html(String name, String link) {
        String safeLink = HtmlUtils.htmlEscape(link);
        return "<!doctype html><html lang=\"es\"><body style=\"font-family:sans-serif;line-height:1.5\">"
            + "<p>Hola, " + HtmlUtils.htmlEscape(name) + ". Pediste elegir una contraseña nueva para STI-OS. "
            + "Usá este enlace en los próximos 30 minutos:</p>"
            + "<p><a href=\"" + safeLink + "\">" + safeLink + "</a></p>"
            + "<p>Sirve una sola vez. Si no lo pediste, ignorá este correo: tu contraseña no cambia.</p>"
            + "</body></html>";
    }
}
