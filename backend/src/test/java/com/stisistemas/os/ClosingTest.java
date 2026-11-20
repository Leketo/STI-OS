package com.stisistemas.os;

import static org.assertj.core.api.Assertions.*;

import com.jayway.jsonpath.JsonPath;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Corte 3A, R-23 (CA-51): a finished task closes as invoiced (with a signature) or as not billable (with one of two
 * reasons, no signature), by ADMIN or SUPERVISOR; it comes back to finished keeping confirmations and signature; two
 * people closing at once leave exactly one closing. Every check reads the database, not only the answer.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.servlet.session.cookie.secure=false")
class ClosingTest {
    static final String PASSWORD = UUID.randomUUID().toString();
    static final String TAG = UUID.randomUUID().toString().substring(0, 8);
    static final UUID COMPANY = UUID.randomUUID();
    static final UUID OTHER_COMPANY = UUID.randomUUID();
    static final UUID PROJECT = UUID.randomUUID();
    static final String HERE = "{\"latitude\":-25.3,\"longitude\":-57.6,\"accuracyM\":12.5}";
    static final String PNG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    static final int ROUNDS = 10;
    static JdbcTemplate owner;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = required("STI_DB_URL");
        String user = required("STI_MIGRATION_USER");
        String password = required("STI_MIGRATION_PASSWORD");
        Flyway.configure().dataSource(url, user, password).schemas("sti").defaultSchema("sti")
            .createSchemas(false).load().migrate();
        owner = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        owner.update("INSERT INTO sti.client VALUES (?, ?), (?, ?)", COMPANY, "Cierre " + TAG, OTHER_COMPANY, "Otra " + TAG);
        owner.update("INSERT INTO sti.project VALUES (?, ?, ?)", PROJECT, COMPANY, "Proyecto cierre " + TAG);
        String hash = new BCryptPasswordEncoder(12).encode(PASSWORD);
        for (String name : new String[]{"admin", "supervisor", "tecnico", "cliente", "otro"}) {
            String role = switch (name) {
                case "admin" -> "ADMIN"; case "supervisor" -> "SUPERVISOR"; case "tecnico" -> "USUARIO"; default -> "CLIENTE";
            };
            UUID company = name.equals("cliente") ? COMPANY : name.equals("otro") ? OTHER_COMPANY : null;
            owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,client_id) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), email(name), "Cierre " + name, hash, role, company);
        }
        // The folder of FoundationTest: the database is shared, and its CA-03/CA-04 check that files and rows match.
        registry.add("sti.uploads.dir", () -> FoundationTest.UPLOADS);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> required("STI_DB_USER"));
        registry.add("spring.datasource.password", () -> required("STI_DB_PASSWORD"));
    }

    @LocalServerPort int port;

    @Test void notBillableNeedsOneOfTwoReasonsComesOnlyFromFinishedAndNeedsNoSignature() throws Exception {
        var supervisor = browser("supervisor");
        String task = finished();
        assertThat(code(close(supervisor, task, "NO_FACTURABLE", null))).isEqualTo("400 MOTIVO_INVALIDO");
        assertThat(code(close(supervisor, task, "NO_FACTURABLE", "CORTESIA"))).isEqualTo("400 MOTIVO_INVALIDO");
        assertThat(code(close(supervisor, task, "FACTURADO", "GARANTIA"))).isEqualTo("400 MOTIVO_INVALIDO");
        assertThat(status(task)).isEqualTo("FINALIZADO -");

        String open = JsonPath.read(supervisor.postJson("/api/tasks", newTask("Abierta"), supervisor.csrf()).body(), "$.id");
        assertThat(close(supervisor, open, "NO_FACTURABLE", "USO_INTERNO").statusCode()).isEqualTo(400);
        assertThat(status(open)).isEqualTo("POR_HACER -");

        var closed = close(supervisor, task, "NO_FACTURABLE", "USO_INTERNO");
        assertThat(closed.statusCode()).isEqualTo(200);
        assertThat(closed.body()).contains("\"status\":\"NO_FACTURABLE\"", "\"closingReason\":\"USO_INTERNO\"");
        assertThat(status(task)).isEqualTo("NO_FACTURABLE USO_INTERNO");
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task_signature WHERE task_id = ?", Integer.class, UUID.fromString(task))).isZero();
        assertThat(owner.queryForObject("SELECT e.closing_reason || ' ' || u.email FROM sti.task_event e JOIN sti.app_user u ON u.id = e.actor_id "
            + "WHERE e.task_id = ? AND e.to_status = 'NO_FACTURABLE'", String.class, UUID.fromString(task)))
            .isEqualTo("USO_INTERNO " + email("supervisor"));
        // A database that already holds a reason without the status (or the other way round) is refused by V6.
        assertThatThrownBy(() -> owner.update("UPDATE sti.task SET closing_reason = 'GARANTIA' WHERE id = ?", UUID.fromString(open)))
            .hasMessageContaining("task_closing_reason_status_check");
    }

    @Test void onlyAdminAndSupervisorCloseAndBringBack() throws Exception {
        String task = finished();
        var technician = browser("tecnico");
        var customer = browser("cliente");
        var other = browser("otro");
        assertThat(close(technician, task, "NO_FACTURABLE", "GARANTIA").statusCode()).isEqualTo(403);
        assertThat(close(customer, task, "NO_FACTURABLE", "GARANTIA").statusCode()).isEqualTo(403);
        assertThat(close(other, task, "NO_FACTURABLE", "GARANTIA").statusCode()).isEqualTo(404);
        assertThat(close(new Browser(), task, "NO_FACTURABLE", "GARANTIA").statusCode()).isEqualTo(401);
        assertThat(status(task)).isEqualTo("FINALIZADO -");

        var admin = browser("admin");
        assertThat(close(admin, task, "NO_FACTURABLE", "GARANTIA").statusCode()).isEqualTo(200);
        // Rule 6: closed as not billable, it is out of sight for technician and customer, as an invoiced one.
        assertThat(technician.get("/api/tasks/" + task).statusCode()).isEqualTo(404);
        assertThat(customer.get("/api/tasks/" + task).statusCode()).isEqualTo(404);
        assertThat(technician.get("/api/tasks").body()).doesNotContain(task);
        assertThat(admin.get("/api/tasks?status=NO_FACTURABLE").body()).contains(task);
        assertThat(close(technician, task, "FINALIZADO", null).statusCode()).isEqualTo(404);
        assertThat(close(customer, task, "FINALIZADO", null).statusCode()).isEqualTo(404);
        assertThat(status(task)).isEqualTo("NO_FACTURABLE GARANTIA");
    }

    @Test void bothOperatorsInvoiceOnlyWithASignatureAndBringingBackKeepsConfirmationsAndSignature() throws Exception {
        var supervisor = browser("supervisor");
        var admin = browser("admin");
        String task = finished();
        assertThat(close(supervisor, task, "FACTURADO", null).statusCode()).isEqualTo(400);
        sign(supervisor, task);
        // D-207: the SUPERVISOR invoices too.
        assertThat(close(supervisor, task, "FACTURADO", null).body()).contains("\"status\":\"FACTURADO\"");
        UUID id = UUID.fromString(task);
        var back = close(admin, task, "FINALIZADO", null);
        assertThat(back.statusCode()).isEqualTo(200);
        assertThat(status(task)).isEqualTo("FINALIZADO -");
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task_assignment WHERE task_id = ? AND confirmed_at IS NOT NULL", Integer.class, id)).isEqualTo(1);
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task_signature WHERE task_id = ? AND superseded_at IS NULL", Integer.class, id)).isEqualTo(1);
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task_event WHERE task_id = ? AND from_status = 'FACTURADO' AND to_status = 'FINALIZADO'", Integer.class, id)).isEqualTo(1);
        assertThat(code(close(admin, task, "FINALIZADO", null))).isEqualTo("409 YA_FINALIZADA");
        // Brought back from not billable: the task loses the reason, the log keeps it.
        assertThat(close(admin, task, "NO_FACTURABLE", "GARANTIA").statusCode()).isEqualTo(200);
        assertThat(close(supervisor, task, "FINALIZADO", null).statusCode()).isEqualTo(200);
        assertThat(status(task)).isEqualTo("FINALIZADO -");
        assertThat(owner.queryForObject("SELECT closing_reason FROM sti.task_event WHERE task_id = ? AND to_status = 'NO_FACTURABLE'", String.class, id)).isEqualTo("GARANTIA");
        // And it is invoiced again without signing again.
        assertThat(close(admin, task, "FACTURADO", null).statusCode()).isEqualTo(200);
        assertThat(close(admin, task, "ANULADA", null).statusCode()).isEqualTo(400);
    }

    @Test void twoPeopleClosingAtOnceLeaveOneClosingAndTheOtherIsTold() throws Exception {
        List<String> failures = new ArrayList<>();
        Map<String, Integer> codes = new TreeMap<>();
        for (int round = 0; round < ROUNDS; round++) {
            String task = finished();
            sign(browser("supervisor"), task);
            var admin = browser("admin");
            var supervisor = browser("supervisor");
            String adminCsrf = admin.csrf(), supervisorCsrf = supervisor.csrf();
            List<HttpResponse<String>> results = together(List.<Callable<HttpResponse<String>>>of(
                () -> close(admin, task, "NO_FACTURABLE", "GARANTIA", adminCsrf),
                () -> close(supervisor, task, "FACTURADO", null, supervisorCsrf)));
            for (var result : results) codes.merge(code(result), 1, Integer::sum);
            int closings = owner.queryForObject("SELECT count(*) FROM sti.task_event WHERE task_id = ? AND to_status IN ('FACTURADO','NO_FACTURABLE')",
                Integer.class, UUID.fromString(task));
            if (closings != 1 || results.stream().filter(r -> r.statusCode() == 200).count() != 1) {
                failures.add("vuelta " + round + ": cierres=" + closings + " " + results.stream().map(ClosingTest::code).toList());
            }
        }
        System.out.println("CA-51 cierres simultáneos: " + failures.size() + " de " + ROUNDS + " vueltas con falla; " + codes);
        assertThat(failures).isEmpty();
        assertThat(codes).containsEntry("409 YA_CERRADA", ROUNDS);
    }

    @Test void twoPeopleBringingBackAtOnceLeaveOneStep() throws Exception {
        List<String> failures = new ArrayList<>();
        for (int round = 0; round < ROUNDS; round++) {
            String task = finished();
            assertThat(close(browser("admin"), task, "NO_FACTURABLE", "USO_INTERNO").statusCode()).isEqualTo(200);
            var admin = browser("admin");
            var supervisor = browser("supervisor");
            String adminCsrf = admin.csrf(), supervisorCsrf = supervisor.csrf();
            List<HttpResponse<String>> results = together(List.<Callable<HttpResponse<String>>>of(
                () -> close(admin, task, "FINALIZADO", null, adminCsrf),
                () -> close(supervisor, task, "FINALIZADO", null, supervisorCsrf)));
            int steps = owner.queryForObject("SELECT count(*) FROM sti.task_event WHERE task_id = ? AND from_status = 'NO_FACTURABLE' AND to_status = 'FINALIZADO'",
                Integer.class, UUID.fromString(task));
            List<String> got = results.stream().map(ClosingTest::code).sorted().toList();
            if (steps != 1 || !got.equals(List.of("200", "409 YA_FINALIZADA"))) failures.add("vuelta " + round + ": pasos=" + steps + " " + got);
        }
        System.out.println("CA-51 vueltas simultáneas: " + failures.size() + " de " + ROUNDS + " vueltas con falla");
        assertThat(failures).isEmpty();
    }

    // ------------------------------------------------------------------------------------------------ helpers

    /** A task carried to FINALIZADO by its single assignee, the technician. */
    private String finished() throws Exception {
        var supervisor = browser("supervisor");
        var technician = browser("tecnico");
        String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask("Trabajo " + UUID.randomUUID()), supervisor.csrf()).body(), "$.id");
        assertThat(supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("tecnico") + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(technician.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", technician.csrf()).statusCode()).isEqualTo(200);
        assertThat(technician.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", technician.csrf()).body())
            .contains("\"status\":\"FINALIZADO\"");
        return task;
    }

    private void sign(Browser who, String task) throws Exception {
        String body = "{\"signerName\":\"José Peña\",\"image\":\"" + PNG_BASE64 + "\",\"location\":" + HERE + "}";
        assertThat(who.postJson("/api/tasks/" + task + "/signature", body, who.csrf()).statusCode()).isEqualTo(201);
    }

    private HttpResponse<String> close(Browser who, String task, String to, String reason) throws Exception {
        return close(who, task, to, reason, who.csrf());
    }

    private HttpResponse<String> close(Browser who, String task, String to, String reason, String csrf) throws Exception {
        String body = "{\"to\":\"" + to + "\",\"location\":" + HERE + (reason == null ? "" : ",\"reason\":\"" + reason + "\"") + "}";
        return who.postJson("/api/tasks/" + task + "/status", body, csrf);
    }

    private static String code(HttpResponse<String> response) {
        if (response.statusCode() == 200) return "200";
        try {
            String code = JsonPath.read(response.body(), "$.code");
            return response.statusCode() + " " + code;
        } catch (RuntimeException noCode) {
            return String.valueOf(response.statusCode());
        }
    }

    private static String status(String task) {
        return owner.queryForObject("SELECT status || ' ' || coalesce(closing_reason, '-') FROM sti.task WHERE id = ?", String.class, UUID.fromString(task));
    }

    private static String newTask(String title) {
        return "{\"projectId\":\"" + PROJECT + "\",\"title\":\"" + title + "\",\"location\":" + HERE + "}";
    }

    private static String email(String name) { return name + "." + TAG + "@example.invalid"; }

    private static UUID userId(String name) {
        return owner.queryForObject("SELECT id FROM sti.app_user WHERE email = ?", UUID.class, email(name));
    }

    private Browser browser(String name) throws Exception {
        var browser = new Browser();
        assertThat(browser.post("/api/auth/login", "username=" + email(name).replace("@", "%40") + "&password=" + PASSWORD, browser.csrf()).statusCode()).isEqualTo(204);
        return browser;
    }

    /** Runs the actions at once: each on its own thread and session, released together by a barrier. */
    private static <T> List<T> together(List<Callable<T>> actions) throws Exception {
        var barrier = new CyclicBarrier(actions.size());
        var pool = Executors.newFixedThreadPool(actions.size());
        try {
            List<Future<T>> pending = new ArrayList<>();
            for (var action : actions) pending.add(pool.submit(() -> { barrier.await(10, TimeUnit.SECONDS); return action.call(); }));
            List<T> results = new ArrayList<>();
            for (var result : pending) results.add(result.get(60, TimeUnit.SECONDS));
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalStateException("Use scripts/ensayo.ps1 -Accion Suite; missing " + key);
        return value;
    }

    class Browser {
        final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();
        URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
        HttpResponse<String> get(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
        }
        String csrf() throws Exception { return JsonPath.read(get("/api/auth/csrf").body(), "$.token"); }
        HttpResponse<String> post(String path, String body, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/x-www-form-urlencoded");
            if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
            return client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        }
        HttpResponse<String> postJson(String path, String body, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
            if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
            return client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
