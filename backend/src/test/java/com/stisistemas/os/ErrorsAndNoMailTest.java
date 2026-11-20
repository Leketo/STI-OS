package com.stisistemas.os;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.io.ByteArrayOutputStream;
import java.net.Socket;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import com.stisistemas.os.mail.RecoveryMailWorker;

/**
 * Two things that need an application started WITHOUT the mail configured, which is also how it starts when the
 * credentials are missing on the server:
 * <ul>
 *   <li>CA-36, "arranque sin configuración": it starts, the screen answers the same and the queue says
 *       "correo no configurado".</li>
 *   <li>CA-33 (QA-003): every error of /api answers with the application's own JSON, with and without a session,
 *       whatever the browser says it accepts. Never the tool's page, the server's time or an exception's text.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "server.servlet.session.cookie.secure=false", "sti.mail.poll-ms=86400000"})
@Import(ErrorsAndNoMailTest.Boom.class)
@ExtendWith(OutputCaptureExtension.class)
class ErrorsAndNoMailTest {
    static final String PASSWORD = "Clave-de-prueba-" + UUID.randomUUID();
    static JdbcTemplate owner;
    static String hash;

    /** A real 500 for a signed-in person, with an exception text that must never reach the answer. */
    @TestConfiguration
    @RestController
    static class Boom {
        @GetMapping("/api/test-boom")
        String boom() { throw new IllegalStateException("detalle-interno /srv/sti-os/secreto jdbc:postgresql://host/db"); }
    }

    @DynamicPropertySource
    static void environment(DynamicPropertyRegistry registry) {
        String url = required("STI_RECOVERY_DB_URL");
        Flyway.configure().dataSource(url, required("STI_MIGRATION_USER"), required("STI_MIGRATION_PASSWORD"))
            .schemas("sti").defaultSchema("sti").createSchemas(false).load().migrate();
        owner = new JdbcTemplate(new DriverManagerDataSource(url, required("STI_MIGRATION_USER"), required("STI_MIGRATION_PASSWORD")));
        hash = new BCryptPasswordEncoder(12).encode(PASSWORD);
        registry.add("sti.uploads.dir", () -> "target/test-uploads-errors");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> required("STI_DB_USER"));
        registry.add("spring.datasource.password", () -> required("STI_DB_PASSWORD"));
        // No sti.mail.* at all.
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + key);
        return value;
    }

    @LocalServerPort int port;
    @Autowired RecoveryMailWorker worker;

    private static UUID account(String email, String role) {
        UUID id = UUID.randomUUID();
        owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role) VALUES (?,?,?,?,?)", id, email, role, hash, role);
        return id;
    }

    // ---------------------------------------------------------------------------------------------- CA-36

    @Test void withoutTheMailConfiguredTheApplicationStartsTheScreenAnswersTheSameAndTheQueueSaysSo(CapturedOutput output) throws Exception {
        assertThat(output.getAll()).contains("correo no configurado");
        String email = "sinconfig-" + UUID.randomUUID().toString().substring(0, 8) + "@correo-prueba.com";
        UUID id = account(email, "USUARIO");
        var real = new TestBrowser(port).post("/api/auth/password-recovery", "{\"email\":\"" + email + "\"}");
        var fake = new TestBrowser(port).post("/api/auth/password-recovery", "{\"email\":\"nadie-" + UUID.randomUUID() + "@correo-prueba.com\"}");
        assertThat(real.statusCode()).isEqualTo(202);
        assertThat(fake.statusCode()).isEqualTo(202);
        assertThat(real.body()).isEqualTo(fake.body());
        worker.processDue();
        assertThat(owner.queryForList("SELECT status || '/' || reason FROM sti.mail_outbox WHERE account_id = ?", String.class, id)).containsExactly("OMITIDO/CORREO_NO_CONFIGURADO");
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.mail_attempt WHERE account_id = ?", Integer.class, id)).isZero();
        assertThat(new TestBrowser(port).get("/api/health").statusCode()).isEqualTo(200);
        assertThat(new TestBrowser(port).login(email, PASSWORD)).as("everything else works").isEqualTo(204);
    }

    // ---------------------------------------------------------------------------------------------- CA-33

    private static final List<String> NEVER = List.of("timestamp", "\"error\"", "\"path\"", "Whitelabel", "Tomcat", "Exception", "<html", "<!doctype",
        "detalle-interno", "/srv/", "jdbc:", "at com.", "trace");

    private void assertOwnJson(HttpResponse<String> answer, int status, String what) {
        assertThat(answer.statusCode()).as(what).isEqualTo(status);
        assertThat(answer.headers().firstValue("content-type").orElse("")).as(what + " content-type").startsWith("application/json");
        Map<String, Object> body = JsonPath.read(answer.body(), "$");
        assertThat(body.get("status")).as(what).isEqualTo(status);
        assertThat(body.keySet()).as(what + " keys").isSubsetOf("status", "code", "message");
        for (String forbidden : NEVER) assertThat(answer.body()).as(what + " must not hold " + forbidden).doesNotContainIgnoringCase(forbidden);
    }

    @Test void everyErrorOfTheApiAnswersWithTheApplicationsOwnJson() throws Exception {
        String technician = "tecnico-" + UUID.randomUUID().toString().substring(0, 8) + "@correo-prueba.com";
        String admin = "admin-" + UUID.randomUUID().toString().substring(0, 8) + "@correo-prueba.com";
        account(technician, "USUARIO");
        account(admin, "ADMIN");
        // What a browser sends, what a program sends, and nothing.
        String[][] accepts = {{"Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}, {"Accept", "application/json"}, {}};
        for (String[] accept : accepts) {
            String tag = accept.length == 0 ? "sin Accept" : accept[1].substring(0, Math.min(12, accept[1].length()));
            var anonymous = new TestBrowser(port);
            var signedTechnician = new TestBrowser(port);
            var signedAdmin = new TestBrowser(port);
            assertThat(signedTechnician.login(technician, PASSWORD)).isEqualTo(204);
            assertThat(signedAdmin.login(admin, PASSWORD)).isEqualTo(204);

            // 401: without a session, an address that exists, one that does not, and one with a strange shape.
            for (String path : new String[]{"/api/accounts", "/api/clients", "/api/no-existe", "/api/tasks/no-es-un-uuid", "/api/a/b/c/d"}) {
                assertOwnJson(anonymous.get(path, accept), 401, "401 sin sesión " + path + " [" + tag + "]");
            }
            // 403: a technician asking for what only the ADMIN can.
            assertOwnJson(signedTechnician.get("/api/accounts", accept), 403, "403 técnico en /api/accounts [" + tag + "]");
            // 404: with a session, an address that does not exist.
            for (String path : new String[]{"/api/no-existe", "/api/tasks/" + UUID.randomUUID() + "/nada", "/api/a/b/c/d"}) {
                assertOwnJson(signedAdmin.get(path, accept), 404, "404 " + path + " [" + tag + "]");
            }
            // 405: the wrong method, with and without a session.
            assertOwnJson(signedAdmin.json("PUT", "/api/clients", "{}", signedAdmin.csrf(), accept), 405, "405 PUT /api/clients con sesión [" + tag + "]");
            assertOwnJson(anonymous.json("POST", "/api/health", "{}", anonymous.csrf(), accept), 405, "405 POST /api/health sin sesión [" + tag + "]");
            assertOwnJson(anonymous.get("/api/auth/password-recovery", accept), 405, "405 GET de recuperar sin sesión [" + tag + "]");
            // 400: a body that is not JSON.
            assertOwnJson(anonymous.json("POST", "/api/auth/password-recovery", "esto no es json", anonymous.csrf(), accept), 400, "400 cuerpo ilegible [" + tag + "]");
            // 403 of the CSRF check, without a token.
            assertOwnJson(signedAdmin.json("POST", "/api/clients", "{}", null, accept), 403, "403 sin CSRF [" + tag + "]");
            // 500: a real one, with a session. The exception's text stays in the server's log.
            assertOwnJson(signedAdmin.get("/api/test-boom", accept), 500, "500 con sesión [" + tag + "]");
            assertOwnJson(anonymous.get("/api/test-boom", accept), 401, "/api/test-boom sin sesión pide ingreso [" + tag + "]");
        }
    }

    @Test void theContainersErrorAddressIsTheSameJsonForWhatNeverReachedTheApplication() {
        var errors = new ErrorJson();
        for (int status : new int[]{400, 401, 403, 404, 405, 413, 500, 503}) {
            var request = new MockHttpServletRequest("GET", "/error");
            request.setAttribute("jakarta.servlet.error.status_code", status);
            var answer = errors.error(request);
            assertThat(answer.getStatusCode().value()).isEqualTo(status);
            assertThat(answer.getBody()).containsExactlyEntriesOf(Map.of("status", status));
            assertThat(answer.getHeaders().getContentType().toString()).isEqualTo("application/json");
        }
        // Asked directly, with nothing wrong behind it: not found, and still only the status.
        assertThat(errors.error(new MockHttpServletRequest("GET", "/error")).getBody()).containsExactlyEntriesOf(Map.of("status", 404));
        // A status that is not an error is not repeated: it is a 500 in the application's own shape.
        var odd = new MockHttpServletRequest("GET", "/error");
        odd.setAttribute("jakarta.servlet.error.status_code", 200);
        assertThat(errors.error(odd).getBody()).containsExactlyEntriesOf(Map.of("status", 500));
    }

    /** What Tomcat itself answers before the application sees the request: also the application's JSON, not its page. */
    @Test void aRequestTheContainerRefusesBeforeTheApplicationAnswersWithoutTheToolsPage() throws Exception {
        for (String line : new String[]{"GET /api/%zz HTTP/1.1", "GET /api/%ff%fe HTTP/1.1", "GET /api/\u0001 HTTP/1.1"}) {
            try (var socket = new Socket("127.0.0.1", port)) {
                socket.setSoTimeout(10000);
                socket.getOutputStream().write((line + "\r\nHost: 127.0.0.1\r\nAccept: text/html\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
                var received = new ByteArrayOutputStream();
                try { socket.getInputStream().transferTo(received); } catch (java.net.SocketTimeoutException ignored) { }
                String text = received.toString(StandardCharsets.ISO_8859_1);
                assertThat(text).as(line).startsWith("HTTP/1.1 ");
                String head = text.contains("\r\n\r\n") ? text.substring(0, text.indexOf("\r\n\r\n")) : text;
                String body = text.contains("\r\n\r\n") ? text.substring(text.indexOf("\r\n\r\n") + 4) : "";
                for (String forbidden : List.of("<html", "<!doctype", "Tomcat", "Whitelabel", "Exception")) assertThat(text).as(line + " must not hold " + forbidden).doesNotContainIgnoringCase(forbidden);
                // It does answer, in the application's own shape: its status in JSON, nothing else.
                assertThat(head).as(line).startsWith("HTTP/1.1 4");
                assertThat(head.toLowerCase()).as(line + " says it is JSON").contains("application/json");
                assertThat(body.trim()).as(line).matches("[{]\"status\":4[0-9][0-9][}]");
            }
        }
    }
}
