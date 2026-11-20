package com.stisistemas.os;

import static org.assertj.core.api.Assertions.assertThat;

import com.icegreen.greenmail.util.GreenMail;
import com.jayway.jsonpath.JsonPath;
import com.stisistemas.os.identity.AuthLimits;
import com.stisistemas.os.mail.MailTls;
import com.stisistemas.os.mail.Mailer;
import com.stisistemas.os.mail.RecoveryMailWorker;
import jakarta.mail.internet.MimeMessage;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Corte 2B (ENCARGO-DEV-003): recovering the password by email and the brakes on sign-in. Real HTTP, a real
 * PostgreSQL, and a fake mail server over SSL (GreenMail, test scope). The state is read from the database and the
 * mail from the fake server, not from the answers of the API.
 *
 * <p>The queue's own timer is switched off here (a day); each test calls {@code worker.processDue()} itself, so
 * what was sent and when is exact. The clock the sign-in windows read is moved by hand.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "server.servlet.session.cookie.secure=false", "sti.mail.poll-ms=86400000", "sti.mail.retry-base-seconds=1"})
@Import(RecoveryTest.Config.class)
@ExtendWith(OutputCaptureExtension.class)
@SuppressWarnings("unchecked")
class RecoveryTest {
    static final String PASSWORD = "Clave-de-prueba-" + UUID.randomUUID();
    static final String NEW_PASSWORD = "Clave-nueva-" + UUID.randomUUID();
    static final String PUBLIC_URL = "https://app.stisistemas.com";
    static GreenMail mail;
    static JdbcTemplate owner;
    static String hash;

    @TestConfiguration
    static class Config {
        @Bean @Primary MailSupport.MutableClock testClock() { return new MailSupport.MutableClock(); }
        @Bean MailTls mailTls() { return MailSupport::trustingFactory; }
    }

    @DynamicPropertySource
    static void environment(DynamicPropertyRegistry registry) {
        String url = required("STI_RECOVERY_DB_URL");
        String user = required("STI_MIGRATION_USER");
        String password = required("STI_MIGRATION_PASSWORD");
        Flyway.configure().dataSource(url, user, password).schemas("sti").defaultSchema("sti").createSchemas(false).load().migrate();
        owner = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        hash = new BCryptPasswordEncoder(12).encode(PASSWORD);
        mail = MailSupport.start(MailSupport.freePort());
        registry.add("sti.uploads.dir", () -> "target/test-uploads-recovery");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> required("STI_DB_USER"));
        registry.add("spring.datasource.password", () -> required("STI_DB_PASSWORD"));
        registry.add("sti.mail.host", () -> "localhost");
        registry.add("sti.mail.port", () -> mail.getSmtps().getPort());
        registry.add("sti.mail.username", () -> MailSupport.SMTP_USER);
        registry.add("sti.mail.password", () -> MailSupport.SMTP_PASSWORD);
        registry.add("sti.mail.from", () -> "STI-OS <notificaciones@stisistemas.com>");
        registry.add("sti.mail.public-url", () -> PUBLIC_URL);
    }

    @AfterAll static void stop() { mail.stop(); }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + key);
        return value;
    }

    @LocalServerPort int port;
    @Autowired MailSupport.MutableClock clock;
    @Autowired RecoveryMailWorker worker;
    @Autowired AuthLimits limits;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;
    @Autowired Mailer mailer;

    @BeforeEach void clean() throws Exception {
        owner.update("DELETE FROM sti.mail_outbox");
        mail.purgeEmailFromAllMailboxes();
    }

    // ---------------------------------------------------------------------------------------------- helpers

    private static String unique(String prefix) { return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@correo-prueba.com"; }

    private static UUID account(String email, String name, boolean enabled, boolean mustChange) {
        UUID id = UUID.randomUUID();
        owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,enabled,must_change_password) VALUES (?,?,?,?,?,?,?)",
            id, email, name, hash, "USUARIO", enabled, mustChange);
        return id;
    }

    private HttpResponse<String> recover(String email) throws Exception {
        return new TestBrowser(port).post("/api/auth/password-recovery", "{\"email\":" + quote(email) + "}");
    }

    private static String quote(String text) { return text == null ? "null" : "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }

    /** A restarted fake server forgets its accounts: the one that sends has to be made again. */
    private static void restartMail() {
        mail.start();
        mail.setUser(MailSupport.SMTP_USER, MailSupport.SMTP_PASSWORD);
    }

    private MimeMessage[] sent() throws Exception { return mail.getReceivedMessages(); }

    /** Requests a link, lets the queue send it, and returns the link the mail carried. */
    private String linkFor(String email) throws Exception {
        mail.purgeEmailFromAllMailboxes();
        assertThat(recover(email).statusCode()).isEqualTo(202);
        worker.processDue();
        assertThat(mail.waitForIncomingEmail(5000, 1)).as("the mail for " + email).isTrue();
        MimeMessage[] messages = sent();
        return MailSupport.link(messages[messages.length - 1]);
    }

    private HttpResponse<String> confirm(String token, String password) throws Exception {
        return new TestBrowser(port).post("/api/auth/password-recovery/confirm", "{\"token\":" + quote(token) + ",\"newPassword\":" + quote(password) + "}");
    }

    private HttpResponse<String> check(String token) throws Exception {
        return new TestBrowser(port).post("/api/auth/password-recovery/check", "{\"token\":" + quote(token) + "}");
    }

    /** Looks for a value in every table and in what the application printed: "comprobado buscándolo". */
    private void nowhere(String secret, CapturedOutput output) {
        for (String table : owner.queryForList("SELECT tablename FROM pg_tables WHERE schemaname = 'sti'", String.class)) {
            Integer found = owner.queryForObject("SELECT count(*) FROM sti." + table + " x WHERE row_to_json(x)::text LIKE ?", Integer.class, "%" + secret + "%");
            assertThat(found).as("'" + secret.substring(0, Math.min(6, secret.length())) + "…' found in sti." + table).isZero();
        }
        assertThat(output.getAll()).as("printed by the application").doesNotContain(secret);
    }

    private static byte[] sha256(String text) throws Exception { return MessageDigest.getInstance("SHA-256").digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }

    // ---------------------------------------------------------------------------------------------- CA-28, CA-38

    @Test void theAnswerIsTheSameWhateverTheEmailIs(CapturedOutput output) throws Exception {
        String active = unique("activa"), inactive = unique("inactiva"), unknown = unique("nadie");
        account(active, "Ana Activa", true, false);
        account(inactive, "Ines Inactiva", false, false);
        String reservedMail = "reservada-" + UUID.randomUUID().toString().substring(0, 8) + "@example.invalid";
        account(reservedMail, "Rita Reservada", true, false);
        String typedPassword = "Mi-clave-escrita-por-error-" + UUID.randomUUID();
        String[] typed = {active, inactive, unknown, reservedMail, "no-es-un-correo", "", "x".repeat(300), typedPassword};

        List<HttpResponse<String>> answers = new ArrayList<>();
        for (String email : typed) answers.add(recover(email));
        answers.add(new TestBrowser(port).post("/api/auth/password-recovery", "{}"));

        var first = answers.get(0);
        for (var answer : answers) {
            assertThat(answer.statusCode()).isEqualTo(202);
            assertThat(answer.body()).isEqualTo(first.body());
            assertThat(answer.headers().firstValue("content-type")).isEqualTo(first.headers().firstValue("content-type"));
            assertThat(answer.headers().map().keySet().stream().map(String::toLowerCase).filter(h -> !h.equals("date") && !h.equals("set-cookie")).sorted().toList())
                .isEqualTo(first.headers().map().keySet().stream().map(String::toLowerCase).filter(h -> !h.equals("date") && !h.equals("set-cookie")).sorted().toList());
        }

        worker.processDue();
        assertThat(sent()).as("only the active account gets a mail").hasSize(1);
        assertThat(sent()[0].getAllRecipients()[0].toString()).isEqualTo(active);
        assertThat(sent()[0].getSubject()).isEqualTo("Recuperar tu contraseña de STI-OS");
        assertThat(sent()[0].getFrom()[0].toString()).contains("STI-OS").contains("<notificaciones@stisistemas.com>");

        // One row for every request (D-160), the reason says why nothing went out.
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.mail_outbox", Integer.class)).isEqualTo(answers.size());
        assertThat(owner.queryForList("SELECT reason FROM sti.mail_outbox WHERE status = 'OMITIDO' ORDER BY reason", String.class))
            .containsExactlyInAnyOrder("CUENTA_INACTIVA", "DOMINIO_RESERVADO", "SIN_CUENTA", "SIN_CUENTA", "SIN_CUENTA", "SIN_CUENTA", "SIN_CUENTA", "SIN_CUENTA");
        assertThat(owner.queryForObject("SELECT status FROM sti.mail_outbox WHERE account_id = (SELECT id FROM sti.app_user WHERE email = ?)", String.class, active)).isEqualTo("ENVIADO");
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.mail_outbox WHERE account_id IS NULL", Integer.class)).isEqualTo(6);
        // D-160: what was typed where no account matched is kept nowhere, in clear or as a hash. Someone typed a password.
        nowhere(typedPassword, output);
        nowhere(unknown, output);
        nowhere(Base64.getEncoder().encodeToString(sha256(unknown)), output);
        // And when there is an account the row holds the account, not the email.
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.mail_outbox x WHERE row_to_json(x)::text LIKE ?", Integer.class, "%" + active + "%")).isZero();
    }

    // ---------------------------------------------------------------------------------------------- CA-37

    @Test void theLinkIsSafe(CapturedOutput output) throws Exception {
        String email = unique("enlace");
        UUID id = account(email, "Elena Enlace", true, false);
        // The pedido names another host in every way it can. The link must still point to the configured address.
        var browser = new TestBrowser(port);
        var answer = browser.post("/api/auth/password-recovery", "{\"email\":\"" + email + "\"}",
            "Host", "evil.example.org", "X-Forwarded-Host", "evil.example.org", "Forwarded", "host=evil.example.org;proto=http",
            "Origin", "http://evil.example.org", "Referer", "http://evil.example.org/x");
        assertThat(answer.statusCode()).isEqualTo(202);
        // The token is born when the mail goes out, not before: nothing of it exists while the row waits.
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.password_reset_token WHERE account_id = ?", Integer.class, id)).isZero();
        worker.processDue();
        mail.waitForIncomingEmail(5000, 1);
        String link = MailSupport.link(sent()[0]);
        String token = MailSupport.token(link);

        assertThat(link).startsWith(PUBLIC_URL + "/nueva-contrasena#");
        assertThat(sent()[0].getContent().toString()).doesNotContain("evil");
        assertThat(MailSupport.body(sent()[0], "text/plain")).doesNotContain("evil").contains("Hola, Elena Enlace.");
        assertThat(MailSupport.body(sent()[0], "text/html")).contains(link).doesNotContain("evil");
        // 256 bits at least, from a secure generator: 43 characters of base64url are 32 bytes.
        assertThat(Base64.getUrlDecoder().decode(token)).hasSize(32);
        assertThat(token).isNotEqualTo(MailSupport.token(linkFor(email)));
        // Only the hash is stored.
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.password_reset_token WHERE account_id = ? AND token_hash = ?", Integer.class, id, sha256(token))).isEqualTo(1);
        nowhere(token, output);
        nowhere(link, output);
    }

    // ---------------------------------------------------------------------------------------------- CA-29

    @Test void choosingTheNewPasswordWithTheLink(CapturedOutput output) throws Exception {
        String email = unique("nueva");
        UUID id = account(email, "Nora Nueva", true, true);
        String hashBefore = owner.queryForObject("SELECT password_hash FROM sti.app_user WHERE id = ?", String.class, id);
        // Two sessions open before the recovery. An account with an initial password in force can sign in.
        var phone = new TestBrowser(port); var laptop = new TestBrowser(port);
        assertThat(phone.login(email, PASSWORD)).isEqualTo(204);
        assertThat(laptop.login(email, PASSWORD)).isEqualTo(204);
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.spring_session WHERE principal_name = ?", Integer.class, email)).isEqualTo(2);

        String token = MailSupport.token(linkFor(email));
        assertThat(check(token).statusCode()).isEqualTo(204);

        // A short password is refused with its own message, and the link keeps serving.
        var short12 = confirm(token, "corta");
        assertThat(short12.statusCode()).isEqualTo(400);
        assertThat((String) JsonPath.read(short12.body(), "$.code")).isEqualTo("CONTRASENA_CORTA");
        assertThat(check(token).statusCode()).isEqualTo(204);
        assertThat(owner.queryForObject("SELECT password_hash FROM sti.app_user WHERE id = ?", String.class, id)).isEqualTo(hashBefore);

        var done = confirm(token, NEW_PASSWORD);
        assertThat(done.statusCode()).isEqualTo(204);

        // The state in the database.
        var row = owner.queryForMap("SELECT password_hash, must_change_password FROM sti.app_user WHERE id = ?", id);
        assertThat(row.get("password_hash")).isNotEqualTo(hashBefore);
        assertThat(new BCryptPasswordEncoder(12).matches(NEW_PASSWORD, (String) row.get("password_hash"))).isTrue();
        assertThat(row.get("must_change_password")).as("the initial-password mark is gone").isEqualTo(false);
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.spring_session WHERE principal_name = ?", Integer.class, email)).as("every session ended").isZero();
        assertThat(owner.queryForObject("SELECT used_at IS NOT NULL FROM sti.password_reset_token WHERE account_id = ?", Boolean.class, id)).isTrue();
        // The other sessions go back to sign-in; the new password enters and the old one does not.
        assertThat(phone.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(laptop.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(new TestBrowser(port).login(email, PASSWORD)).isEqualTo(401);
        var fresh = new TestBrowser(port);
        assertThat(fresh.login(email, NEW_PASSWORD)).isEqualTo(204);
        assertThat(fresh.get("/api/auth/me").body()).contains("\"mustChangePassword\":false");
        // It did not sign anyone in by itself.
        var bystander = new TestBrowser(port);
        confirm(MailSupport.token(linkFor(email)), NEW_PASSWORD + "-otra");
        assertThat(bystander.get("/api/auth/me").statusCode()).isEqualTo(401);

        // The account log says it was a recovery by email, by the account itself, and holds no password or link.
        var event = owner.queryForMap("SELECT actor_id, account_id, changes::text AS changes FROM sti.account_event WHERE kind = 'RECUPERACION_CORREO' AND account_id = ? ORDER BY occurred_at LIMIT 1", id);
        assertThat(event.get("actor_id")).isEqualTo(event.get("account_id"));
        assertThat((String) event.get("changes")).doesNotContain("assword").doesNotContain("http").doesNotContain(NEW_PASSWORD);
        nowhere(NEW_PASSWORD, output);
        nowhere(token, output);
    }

    // ---------------------------------------------------------------------------------------------- CA-30

    @Test void aLinkThatNoLongerWorks() throws Exception {
        String email = unique("vencido");
        UUID id = account(email, "Vera Vencida", true, false);
        String token = MailSupport.token(linkFor(email));

        // 30 minutes from the moment of sending.
        var minutes = owner.queryForObject("SELECT extract(epoch FROM expires_at - created_at) FROM sti.password_reset_token WHERE account_id = ?", Double.class, id);
        assertThat(minutes).isBetween(30 * 60.0 - 1, 30 * 60.0 + 1);

        // Tampered, unknown, empty and malformed answer the same.
        String tampered = token.substring(0, token.length() - 1) + (token.endsWith("A") ? "B" : "A");
        var reference = check(tampered);
        assertThat(reference.statusCode()).isEqualTo(400);
        assertThat((String) JsonPath.read(reference.body(), "$.code")).isEqualTo("ENLACE_INVALIDO");
        assertThat((String) JsonPath.read(reference.body(), "$.message")).isEqualTo("Este enlace ya no sirve. Pedí uno nuevo.");
        for (String bad : new String[]{"", "corto", "x".repeat(200), "../../etc/passwd", Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32])}) {
            assertThat(check(bad).body()).as("check " + bad).isEqualTo(reference.body());
            assertThat(confirm(bad, NEW_PASSWORD).body()).as("confirm " + bad).isEqualTo(reference.body());
        }
        assertThat(confirm(null, NEW_PASSWORD).body()).isEqualTo(reference.body());

        // Expired: the same message.
        owner.update("UPDATE sti.password_reset_token SET expires_at = clock_timestamp() - interval '1 second' WHERE account_id = ?", id);
        assertThat(check(token).statusCode()).isEqualTo(400);
        assertThat(check(token).body()).isEqualTo(reference.body());
        assertThat(confirm(token, NEW_PASSWORD).body()).isEqualTo(reference.body());
        assertThat(new TestBrowser(port).login(email, PASSWORD)).as("the password did not change").isEqualTo(204);

        // Used: the same message.
        String second = MailSupport.token(linkFor(email));
        assertThat(confirm(second, NEW_PASSWORD).statusCode()).isEqualTo(204);
        assertThat(confirm(second, NEW_PASSWORD + "x").body()).isEqualTo(reference.body());
        assertThat(check(second).body()).isEqualTo(reference.body());

        // The hourly limit (3 per email) is its own rule, tested apart; here the window is let pass, so these requests are
        // about links. Link expiry runs on the database's clock, so this does not age any link.
        clock.advance(Duration.ofMinutes(61));
        // A new request cancels the earlier link, even while the earlier one still had time.
        String older = MailSupport.token(linkFor(email));
        assertThat(check(older).statusCode()).isEqualTo(204);
        String newer = MailSupport.token(linkFor(email));
        assertThat(check(older).body()).as("the earlier link died when the new mail went out").isEqualTo(reference.body());
        assertThat(check(newer).statusCode()).isEqualTo(204);

        // An account switched off after the mail went out: the link does not serve either.
        owner.update("UPDATE sti.app_user SET enabled = false WHERE id = ?", id);
        assertThat(check(newer).body()).isEqualTo(reference.body());
        assertThat(confirm(newer, NEW_PASSWORD + "y").body()).isEqualTo(reference.body());
    }

    @Test void aNewRequestCancelsTheOneStillWaiting() throws Exception {
        String email = unique("reemplazo");
        UUID id = account(email, "Rosa Reemplazo", true, false);
        recover(email);
        recover(email);
        assertThat(owner.queryForList("SELECT status || '/' || coalesce(reason, '-') FROM sti.mail_outbox WHERE account_id = ? ORDER BY created_at", String.class, id))
            .containsExactly("DESCARTADO/REEMPLAZADO", "PENDIENTE/-");
        worker.processDue();
        assertThat(sent()).as("one mail, not two").hasSize(1);
    }

    @Test void confirmingDropsWhatWasStillWaiting() throws Exception {
        String email = unique("pendiente");
        UUID id = account(email, "Paula Pendiente", true, false);
        String token = MailSupport.token(linkFor(email));
        recover(email);   // waiting in the queue, not sent
        assertThat(confirm(token, NEW_PASSWORD).statusCode()).isEqualTo(204);
        assertThat(owner.queryForList("SELECT status || '/' || coalesce(reason, '-') FROM sti.mail_outbox WHERE account_id = ? ORDER BY created_at", String.class, id))
            .containsExactly("ENVIADO/-", "DESCARTADO/RESTABLECIDA");
        mail.purgeEmailFromAllMailboxes();
        worker.processDue();
        assertThat(sent()).isEmpty();
    }

    // ---------------------------------------------------------------------------------------------- CA-31, rule 13

    private static final String BLOCKED_TEXT = "Demasiados intentos. Esperá 15 minutos o usá ¿Olvidaste tu contraseña?";

    @Test void fiveFailedSignInsBlockTheEmailEvenWithTheRightPassword() throws Exception {
        String known = unique("bloqueada"), unknown = unique("fantasma");
        UUID id = account(known, "Berta Bloqueada", true, false);
        List<HttpResponse<String>> lastKnown = new ArrayList<>(), lastUnknown = new ArrayList<>();
        for (int i = 1; i <= 4; i++) {
            assertThat(new TestBrowser(port).loginResponse(known, "mal-" + i).statusCode()).isEqualTo(401);
            assertThat(new TestBrowser(port).loginResponse(unknown, "mal-" + i).statusCode()).isEqualTo(401);
        }
        // The fifth failure is the one that blocks, and it says so already.
        var fifthKnown = new TestBrowser(port).loginResponse(known, "mal-5");
        var fifthUnknown = new TestBrowser(port).loginResponse(unknown, "mal-5");
        for (var answer : List.of(fifthKnown, fifthUnknown)) {
            assertThat(answer.statusCode()).isEqualTo(429);
            assertThat((String) JsonPath.read(answer.body(), "$.code")).isEqualTo("DEMASIADOS_INTENTOS");
            assertThat((String) JsonPath.read(answer.body(), "$.message")).isEqualTo(BLOCKED_TEXT);
        }
        assertThat(fifthKnown.body()).as("same text and code for an email that exists and one that does not").isEqualTo(fifthUnknown.body());

        // Blocked: even the right password is refused, with the same answer and without reading the password.
        var rightButBlocked = new TestBrowser(port).loginResponse(known, PASSWORD);
        assertThat(rightButBlocked.statusCode()).isEqualTo(429);
        assertThat(rightButBlocked.body()).isEqualTo(fifthKnown.body());
        assertThat(new TestBrowser(port).loginResponse(known.toUpperCase(), PASSWORD).body()).as("the key ignores case").isEqualTo(fifthKnown.body());
        assertThat(new TestBrowser(port).loginResponse(unknown, "otra").body()).isEqualTo(fifthKnown.body());
        // Other emails are not touched.
        String other = unique("libre");
        account(other, "Lola Libre", true, false);
        assertThat(new TestBrowser(port).login(other, PASSWORD)).isEqualTo(204);

        // The account log learns of it when the account exists, in the account's name and without blaming the person.
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline && owner.queryForObject("SELECT count(*) FROM sti.account_event WHERE kind = 'BLOQUEO_INGRESO' AND account_id = ?", Integer.class, id) == 0) Thread.sleep(50);
        var event = owner.queryForMap("SELECT actor_id, account_id, changes::text AS changes FROM sti.account_event WHERE kind = 'BLOQUEO_INGRESO' AND account_id = ?", id);
        assertThat(event.get("actor_id")).isEqualTo(event.get("account_id"));
        assertThat((String) event.get("changes")).contains("INTENTOS_FALLIDOS").doesNotContain("assword").doesNotContain(PASSWORD);
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.account_event WHERE kind = 'BLOQUEO_INGRESO'", Integer.class)).as("none for the email without an account").isEqualTo(
            owner.queryForObject("SELECT count(*) FROM sti.account_event WHERE kind = 'BLOQUEO_INGRESO' AND account_id IN (SELECT id FROM sti.app_user)", Integer.class));

        // After the 15 minutes it is normal again.
        clock.advance(Duration.ofMinutes(15).plusSeconds(1));
        assertThat(new TestBrowser(port).login(known, PASSWORD)).isEqualTo(204);
        assertThat(new TestBrowser(port).loginResponse(unknown, "x").statusCode()).isEqualTo(401);
    }

    @Test void aRightSignInResetsTheCountAndOldFailuresAgeOut() throws Exception {
        String email = unique("cuenta");
        account(email, "Carla Cuenta", true, false);
        for (int i = 0; i < 4; i++) assertThat(new TestBrowser(port).login(email, "mal")).isEqualTo(401);
        assertThat(new TestBrowser(port).login(email, PASSWORD)).as("a right one at four failures").isEqualTo(204);
        for (int i = 0; i < 4; i++) assertThat(new TestBrowser(port).login(email, "mal")).as("count started again").isEqualTo(401);
        // Four failures, then a long pause: the old ones no longer count.
        clock.advance(Duration.ofMinutes(16));
        assertThat(new TestBrowser(port).login(email, "mal")).isEqualTo(401);
        assertThat(new TestBrowser(port).login(email, PASSWORD)).isEqualTo(204);
    }

    @Test void recoveringByEmailWorksWhileBlockedAndLiftsTheBlock() throws Exception {
        String email = unique("recupera");
        account(email, "Rebeca Recupera", true, false);
        for (int i = 0; i < 5; i++) new TestBrowser(port).login(email, "mal");
        assertThat(new TestBrowser(port).login(email, PASSWORD)).as("blocked").isEqualTo(429);

        String token = MailSupport.token(linkFor(email));
        assertThat(confirm(token, NEW_PASSWORD).statusCode()).isEqualTo(204);
        // No waiting: the recovery lifted the block.
        assertThat(new TestBrowser(port).login(email, NEW_PASSWORD)).isEqualTo(204);
    }

    // ---------------------------------------------------------------------------------------------- CA-39

    @Test void threeRequestsAnHourPerEmail() throws Exception {
        String email = unique("tres");
        UUID id = account(email, "Teresa Tres", true, false);
        mail.purgeEmailFromAllMailboxes();
        for (int i = 1; i <= 3; i++) {
            assertThat(recover(email).statusCode()).isEqualTo(202);
            worker.processDue();
        }
        assertThat(sent()).hasSize(3);
        var fourth = recover(email);
        assertThat(fourth.statusCode()).as("the same answer").isEqualTo(202);
        assertThat(fourth.body()).isEqualTo(recover(unique("otro")).body());
        worker.processDue();
        assertThat(sent()).as("nothing more goes out").hasSize(3);
        assertThat(owner.queryForList("SELECT reason FROM sti.mail_outbox WHERE account_id = ? AND status = 'OMITIDO'", String.class, id)).containsOnly("LIMITE_POR_CORREO");
        // The count is per email, so another is free; and after the hour, this one too.
        String other = unique("libre");
        account(other, "Lucia Libre", true, false);
        recover(other); worker.processDue();
        assertThat(sent()).hasSize(4);
        clock.advance(Duration.ofMinutes(61));
        recover(email); worker.processDue();
        assertThat(sent()).hasSize(5);
    }

    @Test void reservedDomainsGetNothingAndAreRecordedAsSkipped() throws Exception {
        List<String> reserved = List.of("example.invalid", "example.com", "example.net", "example.org", "algo.invalid", "algo.test", "algo.example", "sub.example.com");
        for (String domain : reserved) account("r-" + UUID.randomUUID().toString().substring(0, 8) + "@" + domain, "Reservada", true, false);
        String real = unique("real");
        account(real, "Real Real", true, false);
        for (String email : owner.queryForList("SELECT email FROM sti.app_user WHERE email LIKE 'r-%'", String.class)) assertThat(recover(email).statusCode()).isEqualTo(202);
        recover(real);
        worker.processDue();
        assertThat(sent()).hasSize(1);
        assertThat(owner.queryForList("SELECT reason FROM sti.mail_outbox WHERE status = 'OMITIDO'", String.class)).hasSize(reserved.size()).containsOnly("DOMINIO_RESERVADO");
    }

    @Test void atMostAsManyPasswordChecksAtTheSameTimeAndTheServerKeepsAnswering() throws Exception {
        int max = limits.maxConcurrent();
        assertThat(max).as("default").isEqualTo(4);
        int threads = 24, rounds = 10, failedRounds = 0;
        var pool = Executors.newFixedThreadPool(threads + 1);
        List<String> report = new ArrayList<>();
        String live = unique("sigue");
        account(live, "Luis Sigue", true, false);
        try {
            for (int round = 1; round <= rounds; round++) {
                var barrier = new CyclicBarrier(threads);
                List<Future<Integer>> calls = new ArrayList<>();
                for (int i = 0; i < threads; i++) {
                    String email = unique("ocupado");
                    calls.add(pool.submit(() -> {
                        var browser = new TestBrowser(port);
                        String csrf = browser.csrf();
                        barrier.await(30, TimeUnit.SECONDS);
                        String form = "username=" + java.net.URLEncoder.encode(email, "UTF-8") + "&password=mal";
                        var request = java.net.http.HttpRequest.newBuilder(browser.uri("/api/auth/login")).header("Content-Type", "application/x-www-form-urlencoded")
                            .header("X-CSRF-TOKEN", csrf).POST(java.net.http.HttpRequest.BodyPublishers.ofString(form)).build();
                        var response = browser.client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
                        if (response.statusCode() == 429) assertThat((String) JsonPath.read(response.body(), "$.code")).isEqualTo("SISTEMA_OCUPADO");
                        if (response.statusCode() == 429) assertThat((String) JsonPath.read(response.body(), "$.message")).isEqualTo("El sistema está ocupado. Probá de nuevo en unos segundos.");
                        return response.statusCode();
                    }));
                }
                // While the burst runs, the server keeps answering something that checks no password.
                Future<Integer> health = pool.submit(() -> { Thread.sleep(100); return new TestBrowser(port).get("/api/health").statusCode(); });
                int ok = 0, busy = 0, other = 0;
                for (var call : calls) {
                    int status = call.get(60, TimeUnit.SECONDS);
                    if (status == 401) ok++; else if (status == 429) busy++; else other++;
                }
                boolean fine = other == 0 && busy >= 1 && ok >= 1 && ok <= threads && health.get(30, TimeUnit.SECONDS) == 200;
                // Nothing is left held: a sign-in right after goes through.
                fine &= new TestBrowser(port).login(live, PASSWORD) == 204;
                if (!fine) failedRounds++;
                report.add("ronda " + round + ": 401=" + ok + " 429=" + busy + " otros=" + other + (fine ? "" : " FALLA"));
            }
        } finally {
            pool.shutdownNow();
        }
        System.out.println("[CA-39 tope " + max + "] rondas con falla: " + failedRounds + " de " + rounds + " | " + String.join(" | ", report));
        assertThat(failedRounds).as(String.join(" | ", report)).isZero();
    }

    @Test void theThreeChecksShareTheCeilingAndOtherRequestsAreNotTouched() throws Exception {
        String email = unique("tope");
        account(email, "Tomas Tope", true, false);
        var signedIn = new TestBrowser(port);
        assertThat(signedIn.login(email, PASSWORD)).isEqualTo(204);
        int max = limits.maxConcurrent();
        for (int i = 0; i < max; i++) assertThat(limits.tryCheck()).isTrue();
        try {
            assertThat(limits.tryCheck()).as("no more than the ceiling").isFalse();
            var login = new TestBrowser(port).loginResponse(email, PASSWORD);
            var change = signedIn.post("/api/auth/password", "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"" + NEW_PASSWORD + "\"}");
            var confirm = confirm(MailSupport.token("a#" + Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32])), NEW_PASSWORD);
            for (var answer : List.of(login, change, confirm)) {
                assertThat(answer.statusCode()).isEqualTo(429);
                assertThat((String) JsonPath.read(answer.body(), "$.code")).isEqualTo("SISTEMA_OCUPADO");
            }
            // What checks no password is not limited.
            assertThat(recover(email).statusCode()).isEqualTo(202);
            assertThat(check("x").statusCode()).isEqualTo(400);
            assertThat(new TestBrowser(port).get("/api/health").statusCode()).isEqualTo(200);
            assertThat(signedIn.get("/api/auth/me").statusCode()).isEqualTo(200);
        } finally {
            for (int i = 0; i < max; i++) limits.endCheck();
        }
        assertThat(new TestBrowser(port).login(email, PASSWORD)).as("released").isEqualTo(204);
    }

    // ---------------------------------------------------------------------------------------------- CA-36

    @Test void aFailingMailServerBreaksNothingAndTheQueueRetriesWithGrowingWaits(CapturedOutput output) throws Exception {
        String email = unique("falla");
        UUID id = account(email, "Fabiana Falla", true, false);
        int smtpPort = mail.getSmtps().getPort();
        mail.stop();
        try {
            long started = System.nanoTime();
            assertThat(recover(email).statusCode()).as("what the person does does not fail").isEqualTo(202);
            assertThat(Duration.ofNanos(System.nanoTime() - started)).as("the request does not wait for the mail").isLessThan(Duration.ofSeconds(3));
            worker.processDue();
            var row = owner.queryForMap("SELECT status, attempts, next_attempt_at > clock_timestamp() AS later FROM sti.mail_outbox WHERE account_id = ?", id);
            assertThat(row.get("status")).isEqualTo("PENDIENTE");
            assertThat(row.get("attempts")).isEqualTo(1);
            assertThat(row.get("later")).as("put off, not retried at once").isEqualTo(true);
            assertThat(owner.queryForObject("SELECT result FROM sti.mail_attempt WHERE account_id = ?", String.class, id)).isEqualTo("ConnectException");
            // The second failure waits longer than the first one did.
            double firstWait = owner.queryForObject("SELECT extract(epoch FROM next_attempt_at - clock_timestamp()) FROM sti.mail_outbox WHERE account_id = ?", Double.class, id);
            owner.update("UPDATE sti.mail_outbox SET next_attempt_at = clock_timestamp() WHERE account_id = ?", id);
            worker.processDue();
            double secondWait = owner.queryForObject("SELECT extract(epoch FROM next_attempt_at - clock_timestamp()) FROM sti.mail_outbox WHERE account_id = ?", Double.class, id);
            assertThat(secondWait).isGreaterThan(firstWait + 0.5);
            assertThat(owner.queryForObject("SELECT count(*) FROM sti.password_reset_token WHERE account_id = ?", Integer.class, id)).as("no token for a mail that did not go out").isZero();
        } finally {
            restartMail();
        }
        // The server comes back: the next try sends it. Two failed attempts and one that went out.
        assertThat(mail.getSmtps().getPort()).isEqualTo(smtpPort);
        owner.update("UPDATE sti.mail_outbox SET next_attempt_at = clock_timestamp() WHERE account_id = ?", id);
        worker.processDue();
        assertThat(owner.queryForList("SELECT result FROM sti.mail_attempt WHERE account_id = ? ORDER BY attempt", String.class, id)).containsExactly("ConnectException", "ConnectException", "ENVIADO");
        assertThat(owner.queryForObject("SELECT status FROM sti.mail_outbox WHERE account_id = ?", String.class, id)).isEqualTo("ENVIADO");
        assertThat(sent()).hasSize(1);
        // The register of sends: account, kind, attempt, result, time. No link, no token, no password.
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.mail_attempt WHERE account_id = ? AND kind = 'RECUPERACION' AND attempt >= 1 AND occurred_at IS NOT NULL", Integer.class, id)).isEqualTo(3);
        nowhere(MailSupport.SMTP_PASSWORD, output);
        nowhere(MailSupport.token(MailSupport.link(sent()[0])), output);
        nowhere(MailSupport.link(sent()[0]), output);
        assertThat(output.getAll()).doesNotContain("nueva-contrasena");
    }

    @Test void aMailThatCouldNotGoOutInSixtyMinutesIsDroppedAndSaysSo() throws Exception {
        String email = unique("sesenta");
        UUID id = account(email, "Sofia Sesenta", true, false);
        recover(email);
        owner.update("UPDATE sti.mail_outbox SET created_at = clock_timestamp() - interval '61 minutes' WHERE account_id = ?", id);
        worker.processDue();
        assertThat(owner.queryForList("SELECT status || '/' || reason FROM sti.mail_outbox WHERE account_id = ?", String.class, id)).containsExactly("DESCARTADO/VENCIDO");
        assertThat(sent()).isEmpty();
    }

    @Test void afterTheMaximumOfTriesTheMailIsDropped() throws Exception {
        String email = unique("maximo");
        UUID id = account(email, "Mauro Maximo", true, false);
        mail.stop();
        try {
            recover(email);
            for (int i = 0; i < 8; i++) {
                owner.update("UPDATE sti.mail_outbox SET next_attempt_at = clock_timestamp() WHERE account_id = ? AND status = 'PENDIENTE'", id);
                worker.processDue();
            }
        } finally {
            restartMail();
        }
        assertThat(owner.queryForList("SELECT status || '/' || reason || '/' || attempts FROM sti.mail_outbox WHERE account_id = ?", String.class, id)).containsExactly("DESCARTADO/MAXIMO_DE_INTENTOS/6");
    }

    @Test void theOwnCeilingOfThirtyAnHourAndTwoHundredADay() throws Exception {
        String email = unique("tope-envio");
        UUID id = account(email, "Teo Tope", true, false);
        UUID filler = UUID.randomUUID();
        owner.update("INSERT INTO sti.mail_outbox (id, kind, status, finished_at) VALUES (?, 'RECUPERACION', 'ENVIADO', clock_timestamp())", filler);
        // 30 sent in the last hour: the next one waits.
        for (int i = 0; i < 30; i++) owner.update("INSERT INTO sti.mail_attempt (id, outbox_id, kind, attempt, result) VALUES (?, ?, 'RECUPERACION', 1, 'ENVIADO')", UUID.randomUUID(), filler);
        recover(email);
        worker.processDue();
        assertThat(sent()).as("held back by the hourly ceiling").isEmpty();
        assertThat(owner.queryForObject("SELECT status FROM sti.mail_outbox WHERE account_id = ?", String.class, id)).isEqualTo("PENDIENTE");
        // 200 in the last day, none in the last hour: still held back.
        owner.update("UPDATE sti.mail_attempt SET occurred_at = clock_timestamp() - interval '3 hours' WHERE outbox_id = ?", filler);
        for (int i = 0; i < 170; i++) owner.update("INSERT INTO sti.mail_attempt (id, outbox_id, kind, attempt, result, occurred_at) VALUES (?, ?, 'RECUPERACION', 1, 'ENVIADO', clock_timestamp() - interval '5 hours')", UUID.randomUUID(), filler);
        owner.update("UPDATE sti.mail_outbox SET next_attempt_at = clock_timestamp() WHERE account_id = ?", id);
        worker.processDue();
        assertThat(sent()).as("held back by the daily ceiling").isEmpty();
        // Under both ceilings it goes out.
        owner.update("DELETE FROM sti.mail_attempt WHERE outbox_id = ?", filler);
        owner.update("UPDATE sti.mail_outbox SET next_attempt_at = clock_timestamp() WHERE account_id = ?", id);
        worker.processDue();
        assertThat(sent()).hasSize(1);
        owner.update("DELETE FROM sti.mail_outbox WHERE id = ?", filler);
    }

    @Test void theQueueSurvivesARestart() throws Exception {
        String email = unique("reinicio");
        UUID id = account(email, "Rosario Reinicio", true, false);
        recover(email);
        assertThat(owner.queryForObject("SELECT status FROM sti.mail_outbox WHERE account_id = ?", String.class, id)).isEqualTo("PENDIENTE");
        // A new worker, as after a restart: the only memory it has is the database.
        new RecoveryMailWorker(jdbc, tx, mailer, 1).processDue();
        assertThat(sent()).hasSize(1);
        assertThat(owner.queryForObject("SELECT status FROM sti.mail_outbox WHERE account_id = ?", String.class, id)).isEqualTo("ENVIADO");
    }

    // ---------------------------------------------------------------------------------------------- CA-40, CA-41

    @Test void theNewAddressesAreTheSameForEveryRoleAndWithoutASession() throws Exception {
        List<TestBrowser> people = new ArrayList<>();
        for (String role : new String[]{"ADMIN", "SUPERVISOR", "USUARIO"}) {
            String email = unique(role.toLowerCase());
            UUID id = UUID.randomUUID();
            owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role) VALUES (?,?,?,?,?)", id, email, role, hash, role);
            var browser = new TestBrowser(port);
            assertThat(browser.login(email, PASSWORD)).isEqualTo(204);
            people.add(browser);
        }
        people.add(new TestBrowser(port));
        for (var browser : people) {
            assertThat(browser.post("/api/auth/password-recovery", "{\"email\":\"" + unique("x") + "\"}").statusCode()).isEqualTo(202);
            assertThat(browser.post("/api/auth/password-recovery/check", "{\"token\":\"x\"}").statusCode()).isEqualTo(400);
            assertThat(browser.post("/api/auth/password-recovery/confirm", "{\"token\":\"x\",\"newPassword\":\"" + NEW_PASSWORD + "\"}").statusCode()).isEqualTo(400);
        }
        // They are POST and need the CSRF token like everything that changes something.
        assertThat(new TestBrowser(port).json("POST", "/api/auth/password-recovery", "{\"email\":\"a@b.com\"}", null).statusCode()).isEqualTo(403);
        assertThat(new TestBrowser(port).get("/api/auth/password-recovery").statusCode()).isEqualTo(405);
    }

    @Test void theJarSaysWhichCommitItCameFromAndNothingElseDoesNotLeak(CapturedOutput output) throws Exception {
        assertThat(output.getAll()).containsPattern("Commit del JAR: [0-9a-f]{40} dirty=(true|false)");
        // Only four facts are kept in what the plugin wrote: no author, email, machine, user, repository or branch.
        var properties = new java.util.Properties();
        try (var in = RecoveryTest.class.getResourceAsStream("/git.properties")) { properties.load(in); }
        assertThat(properties.stringPropertyNames()).containsExactlyInAnyOrder("git.commit.id", "git.commit.id.abbrev", "git.commit.time", "git.dirty");
        // And it is in no public answer.
        String commit = properties.getProperty("git.commit.id");
        var browser = new TestBrowser(port);
        for (String path : new String[]{"/api/health", "/api/auth/csrf", "/api/zzz", "/error"}) {
            var answer = browser.get(path);
            assertThat(answer.body()).as(path).doesNotContain(commit).doesNotContain(commit.substring(0, 7));
            assertThat(answer.headers().map().toString()).as(path).doesNotContain(commit.substring(0, 7));
        }
    }
}
