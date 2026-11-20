package com.stisistemas.os.identity;

import com.stisistemas.os.Refusal;
import com.stisistemas.os.mail.Mailer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Recovering the password by email (ENCARGO-DEV-003, section A).
 *
 * <p>The request never sends anything: it writes a row in the queue and answers. What a row looks like depends on
 * the account, but the work is always the same three statements (look up, supersede, insert), so an address with
 * an account, one without and one that is inactive cost the same (rules 1 and 2, D-160). The mail goes out later,
 * from {@link com.stisistemas.os.mail.RecoveryMailWorker}, which is where the token is born.
 */
@Service
public class PasswordRecovery {
    static final int REQUESTS_PER_HOUR = 3;
    static final Duration REQUEST_WINDOW = Duration.ofHours(1);
    static final String INVALID_LINK = "Este enlace ya no sirve. Pedí uno nuevo.";
    /** Fixed account id that matches nothing: lets a request without an account run the same statement. */
    private static final Pattern TOKEN_SHAPE = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final PasswordEncoder passwords;
    private final Accounts accounts;
    private final AuthLimits limits;
    private final Mailer mailer;
    private final Throttle requests;

    public PasswordRecovery(JdbcTemplate jdbc, TransactionTemplate tx, PasswordEncoder passwords, Accounts accounts,
                            AuthLimits limits, Mailer mailer, Clock clock) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.passwords = passwords;
        this.accounts = accounts;
        this.limits = limits;
        this.mailer = mailer;
        this.requests = new Throttle(clock, AuthLimits.CAPACITY);
    }

    // ---------------------------------------------------------------------------------------------- the request

    private record Found(UUID id, String email, boolean enabled) {}

    public void request(String typed) {
        String email = typed == null ? "" : typed.trim().toLowerCase(Locale.ROOT);
        if (email.length() > 254) email = email.substring(0, 254);
        // Rule 8: at most 3 requests an hour per email, counted whether or not there is an account.
        boolean overLimit = requests.hit(Throttle.key(email), REQUEST_WINDOW) > REQUESTS_PER_HOUR;

        List<Found> found = jdbc.query("SELECT id, email, enabled FROM sti.app_user WHERE email = ?",
            (rs, n) -> new Found(rs.getObject("id", UUID.class), rs.getString("email"), rs.getBoolean("enabled")), email);
        Found account = found.isEmpty() ? null : found.get(0);

        String status = "OMITIDO";
        String reason;
        if (account == null) reason = "SIN_CUENTA";
        else if (!account.enabled()) reason = "CUENTA_INACTIVA";
        else if (Mailer.reservedDomain(account.email())) reason = "DOMINIO_RESERVADO";
        else if (overLimit) reason = "LIMITE_POR_CORREO";
        else if (!mailer.configured()) reason = "CORREO_NO_CONFIGURADO";
        else { status = "PENDIENTE"; reason = null; }
        boolean pending = "PENDIENTE".equals(status);

        // DEV-05: the request does the same work whatever the email is: one row, nothing else. A new request still
        // cancels the one waiting, but the mail worker does it when it picks the older row (RecoveryMailWorker), so
        // replacing a row never costs time here. Writing the replacement here made the 2nd and 3rd request of an
        // existing account measurably slower (CA-38).
        // D-160: with no account the row keeps nothing of what was typed, in clear or hashed.
        jdbc.update("INSERT INTO sti.mail_outbox (id, account_id, kind, status, reason, finished_at) VALUES "
            + "(?, ?, 'RECUPERACION', ?, ?, CASE WHEN ? THEN NULL ELSE clock_timestamp() END)",
            UUID.randomUUID(), account == null ? null : account.id(), status, reason, pending);
    }

    // ---------------------------------------------------------------------------------------------- the link

    /** Whether a link still serves. Used, expired, tampered with and unknown all answer the same (rule 7). */
    public void check(String token) {
        if (token == null || !TOKEN_SHAPE.matcher(token).matches()) throw invalid();
        boolean live = Boolean.TRUE.equals(jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM sti.password_reset_token t JOIN sti.app_user u ON u.id = t.account_id "
            + "WHERE t.token_hash = ? AND t.used_at IS NULL AND t.revoked_at IS NULL "
            + "AND t.expires_at > clock_timestamp() AND u.enabled)", Boolean.class, (Object) hash(token)));
        if (!live) throw invalid();
    }

    /**
     * Rule 6: the new password replaces the old one; the initial-password mark goes; every session of the person
     * ends; the link is used; the pending mails are dropped; the sign-in block is lifted; the account log says so.
     */
    public void confirm(String token, String newPassword) {
        if (token == null || !TOKEN_SHAPE.matcher(token).matches()) throw invalid();
        if (newPassword == null || newPassword.length() < SessionController.MIN_PASSWORD
            || newPassword.length() > SessionController.MAX_PASSWORD) {
            // Checked after the link, so a bad link never says anything about the password.
            check(token);
            throw new Refusal(HttpStatus.BAD_REQUEST, "CONTRASENA_CORTA",
                "La contraseña nueva tiene que tener 12 caracteres como mínimo.");
        }
        String email = tx.execute(status -> {
            var rows = jdbc.query("SELECT t.id, t.account_id FROM sti.password_reset_token t "
                + "WHERE t.token_hash = ? AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at > clock_timestamp() "
                + "FOR UPDATE", (rs, n) -> new UUID[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)}, (Object) hash(token));
            if (rows.isEmpty()) throw invalid();
            UUID tokenId = rows.get(0)[0], accountId = rows.get(0)[1];
            var accountRows = jdbc.query("SELECT email FROM sti.app_user WHERE id = ? AND enabled FOR UPDATE",
                (rs, n) -> rs.getString(1), accountId);
            if (accountRows.isEmpty()) throw invalid();
            String accountEmail = accountRows.get(0);

            jdbc.update("UPDATE sti.app_user SET password_hash = ?, must_change_password = false WHERE id = ?",
                passwords.encode(newPassword), accountId);
            jdbc.update("UPDATE sti.password_reset_token SET used_at = clock_timestamp() WHERE id = ?", tokenId);
            jdbc.update("UPDATE sti.password_reset_token SET revoked_at = clock_timestamp() "
                + "WHERE account_id = ? AND used_at IS NULL AND revoked_at IS NULL", accountId);
            jdbc.update("UPDATE sti.mail_outbox SET status = 'DESCARTADO', reason = 'RESTABLECIDA', finished_at = clock_timestamp() "
                + "WHERE account_id = ? AND status = 'PENDIENTE'", accountId);
            accounts.endSessions(accountEmail, null);
            accounts.log(accountId, accountId, "RECUPERACION_CORREO", Map.of("medio", "CORREO"));
            return accountEmail;
        });
        limits.lift(email);
    }

    private static Refusal invalid() { return new Refusal(HttpStatus.BAD_REQUEST, "ENLACE_INVALIDO", INVALID_LINK); }

    // ---------------------------------------------------------------------------------------------- the token

    /** 256 bits from a secure generator, URL safe. It exists only in the memory of the sender and in the mail. */
    public static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** What the database keeps. A SHA-256 is enough for a value that is already 256 random bits. */
    public static byte[] hash(String token) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
