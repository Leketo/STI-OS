package com.stisistemas.os;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.stisistemas.os.task.Constancia;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
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
 * CA-52 (corte 3A, R-21) through the API: who downloads the service record, with which headers, and that its dates
 * are the ones in the database, in Paraguay time. Nothing is kept: no file, no row.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.servlet.session.cookie.secure=false")
class ConstanciaTest {
    static final String PASSWORD = UUID.randomUUID().toString();
    static final String TAG = UUID.randomUUID().toString().substring(0, 8);
    static final UUID COMPANY = UUID.randomUUID(), OTHER = UUID.randomUUID(), PROJECT = UUID.randomUUID();
    static final String HERE = "{\"latitude\":-25.3,\"longitude\":-57.6,\"accuracyM\":12.5}";
    static final String PNG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    static JdbcTemplate owner;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = required("STI_DB_URL"), user = required("STI_MIGRATION_USER"), password = required("STI_MIGRATION_PASSWORD");
        Flyway.configure().dataSource(url, user, password).schemas("sti").defaultSchema("sti").createSchemas(false).load().migrate();
        owner = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        owner.update("INSERT INTO sti.client VALUES (?, ?), (?, ?)", COMPANY, "Ñandutí Asunción " + TAG, OTHER, "Otra empresa " + TAG);
        owner.update("INSERT INTO sti.project VALUES (?, ?, ?)", PROJECT, COMPANY, "Obrador — cableado " + TAG);
        String hash = new BCryptPasswordEncoder(12).encode(PASSWORD);
        String[][] people = {{"admin", "ADMIN"}, {"supervisor", "SUPERVISOR"}, {"tecnico", "USUARIO"}, {"cliente", "CLIENTE"}, {"otro", "CLIENTE"}};
        for (String[] p : people) {
            UUID company = p[0].equals("cliente") ? COMPANY : p[0].equals("otro") ? OTHER : null;
            owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,client_id) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), email(p[0]), p[0].equals("tecnico") ? "José Peña " + TAG : "Constancia " + p[0], hash, p[1], company);
        }
        registry.add("sti.uploads.dir", () -> FoundationTest.UPLOADS);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> required("STI_DB_USER"));
        registry.add("spring.datasource.password", () -> required("STI_DB_PASSWORD"));
    }

    @LocalServerPort int port;

    @Test void whoDownloadsItAndWithWhichHeaders() throws Exception {
        var admin = browser("admin"); var supervisor = browser("supervisor");
        var technician = browser("tecnico"); var customer = browser("cliente"); var other = browser("otro");
        String open = JsonPath.read(supervisor.postJson("/api/tasks", newTask("Abierta"), supervisor.csrf()).body(), "$.id");
        assertThat(code(admin.get(path(open)))).isEqualTo("409 SIN_CONSTANCIA");

        String task = finished(supervisor, technician);
        assertThat(new Browser().get(path(task)).statusCode()).isEqualTo(401);
        assertThat(technician.get(path(task)).statusCode()).as("never the technician, even assigned").isEqualTo(403);
        assertThat(other.get(path(task)).statusCode()).as("a customer of another company").isEqualTo(404);
        for (Browser who : new Browser[]{admin, supervisor, customer}) {
            var answer = who.get(path(task));
            assertThat(answer.statusCode()).isEqualTo(200);
            assertThat(answer.headers().firstValue("Content-Type")).hasValue("application/pdf");
            assertThat(answer.headers().firstValue("Cache-Control")).hasValue("no-store");
            String code = com.stisistemas.os.task.Tasks.code(owner.queryForObject("SELECT number FROM sti.task WHERE id = ?", Integer.class, UUID.fromString(task)));
            assertThat(answer.headers().firstValue("Content-Disposition")).hasValue("attachment; filename=\"constancia-" + code + ".pdf\"");
            assertThat(new String(answer.body(), 0, 5)).isEqualTo("%PDF-");
        }
        // Closed, the customer no longer sees it (rule 6); the operators still download it, in both closed states.
        assertThat(close(admin, task, "NO_FACTURABLE", "GARANTIA")).isEqualTo(200);
        assertThat(customer.get(path(task)).statusCode()).isEqualTo(404);
        assertThat(supervisor.get(path(task)).statusCode()).isEqualTo(200);
        assertThat(close(admin, task, "FINALIZADO", null)).isEqualTo(200);
        sign(customer, task);
        assertThat(close(supervisor, task, "FACTURADO", null)).isEqualTo(200);
        assertThat(admin.get(path(task)).statusCode()).isEqualTo(200);
        assertThat(technician.get(path(task)).statusCode()).isEqualTo(403);
    }

    @Test void theDatesAreTheDatabasesInParaguayTimeAndNothingIsKept() throws Exception {
        var supervisor = browser("supervisor"); var technician = browser("tecnico"); var customer = browser("cliente");
        String task = finished(supervisor, technician);
        UUID id = UUID.fromString(task);
        var before = text(supervisor.get(path(task)).body());
        assertThat(before).contains("Ñandutí Asunción " + TAG, "Obrador — cableado " + TAG, "José Peña " + TAG, "Responsable");
        assertThat(before).containsPattern("Firma\s+—").doesNotContain("Firmó el");
        sign(customer, task);
        // Two hours back, so that a later step cannot fall in the same minute and pass for the finish.
        owner.update("UPDATE sti.task_event SET occurred_at = occurred_at - interval '2 hours' WHERE task_id = ?", id);
        owner.update("UPDATE sti.task SET created_at = created_at - interval '3 hours' WHERE id = ?", id);
        var created = owner.queryForObject("SELECT created_at FROM sti.task WHERE id = ?", OffsetDateTime.class, id);
        var started = owner.queryForObject("SELECT min(occurred_at) FROM sti.task_event WHERE task_id = ? AND to_status = 'EN_PROCESO'", OffsetDateTime.class, id);
        var ended = owner.queryForObject("SELECT max(occurred_at) FROM sti.task_event WHERE task_id = ? AND to_status = 'FINALIZADO'", OffsetDateTime.class, id);
        var signed = owner.queryForObject("SELECT signed_at FROM sti.task_signature WHERE task_id = ? AND superseded_at IS NULL", OffsetDateTime.class, id);
        String after = text(supervisor.get(path(task)).body());
        assertThat(after).containsPattern("Solicitud\s+" + java.util.regex.Pattern.quote(paraguay(created)));
        assertThat(after).containsPattern("Atención\s+" + java.util.regex.Pattern.quote(paraguay(started)));
        assertThat(after).containsPattern("Finalizada\s+" + java.util.regex.Pattern.quote(paraguay(ended)));
        assertThat(after).containsPattern("Firma\s+" + java.util.regex.Pattern.quote(paraguay(signed)));
        assertThat(after).contains("Aclaración: José Peña", "A distancia");
        // "Volver a Finalizadas" is not the work finishing: the finish date stays the one of the work.
        assertThat(close(browser("admin"), task, "NO_FACTURABLE", "USO_INTERNO")).isEqualTo(200);
        assertThat(close(browser("admin"), task, "FINALIZADO", null)).isEqualTo(200);
        assertThat(text(supervisor.get(path(task)).body())).containsPattern("Finalizada\s+" + java.util.regex.Pattern.quote(paraguay(ended)));
        // Reopened for real (CA-52): back to EN_PROCESO and finished again by the technician's confirmation. The finish
        // moves to the new one, the start stays the first, and the signature, superseded by the reopening, is blank.
        assertThat(close(browser("admin"), task, "EN_PROCESO", null)).isEqualTo(200);
        assertThat(technician.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", technician.csrf()).body())
            .contains("\"status\":\"FINALIZADO\"");
        var again = owner.queryForObject("SELECT max(occurred_at) FROM sti.task_event WHERE task_id = ? AND from_status = 'EN_PROCESO' "
            + "AND to_status = 'FINALIZADO'", OffsetDateTime.class, id);
        assertThat(again).isAfter(ended.plusHours(1));
        String reopened = text(supervisor.get(path(task)).body());
        assertThat(reopened).containsPattern("Atención\s+" + java.util.regex.Pattern.quote(paraguay(started)));
        assertThat(reopened).containsPattern("Finalizada\s+" + java.util.regex.Pattern.quote(paraguay(again)));
        assertThat(reopened).containsPattern("Firma\s+—").doesNotContain("Aclaración: José Peña");
        // Made on demand and never kept: downloading leaves no file and no row.
        int files = files(), rows = rows();
        assertThat(supervisor.get(path(task)).statusCode()).isEqualTo(200);
        assertThat(files()).isEqualTo(files);
        assertThat(rows()).isEqualTo(rows);
    }

    // ------------------------------------------------------------------------------------------------ helpers

    static String paraguay(OffsetDateTime instant) {
        return instant.atZoneSameInstant(Constancia.PARAGUAY).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
    }

    static String text(byte[] pdf) throws Exception {
        try (var document = Loader.loadPDF(pdf)) { return new PDFTextStripper().getText(document); }
    }

    static int files() throws Exception {
        Path dir = Path.of(FoundationTest.UPLOADS);
        if (!Files.isDirectory(dir)) return 0;
        try (var listing = Files.list(dir)) { return (int) listing.count(); }
    }

    static int rows() {
        return owner.queryForObject("SELECT (SELECT count(*) FROM sti.task_signature) + (SELECT count(*) FROM sti.task_event) "
            + "+ (SELECT count(*) FROM sti.task_photo) + (SELECT count(*) FROM sti.task)", Integer.class);
    }

    private String finished(Browser supervisor, Browser technician) throws Exception {
        String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask("Constancia " + UUID.randomUUID()), supervisor.csrf()).body(), "$.id");
        String technicianId = owner.queryForObject("SELECT id::text FROM sti.app_user WHERE email = ?", String.class, email("tecnico"));
        supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + technicianId + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf());
        technician.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", technician.csrf());
        assertThat(technician.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", technician.csrf()).body())
            .contains("\"status\":\"FINALIZADO\"");
        return task;
    }

    private void sign(Browser who, String task) throws Exception {
        String body = "{\"signerName\":\"José Peña\",\"image\":\"" + PNG_BASE64 + "\",\"location\":" + HERE + "}";
        assertThat(who.postJson("/api/tasks/" + task + "/signature", body, who.csrf()).statusCode()).isEqualTo(201);
    }

    private int close(Browser who, String task, String to, String reason) throws Exception {
        String body = "{\"to\":\"" + to + "\",\"location\":" + HERE + (reason == null ? "" : ",\"reason\":\"" + reason + "\"") + "}";
        return who.postJson("/api/tasks/" + task + "/status", body, who.csrf()).statusCode();
    }

    private static String code(HttpResponse<byte[]> response) {
        String code = JsonPath.read(new String(response.body(), java.nio.charset.StandardCharsets.UTF_8), "$.code");
        return response.statusCode() + " " + code;
    }

    private static String path(String task) { return "/api/tasks/" + task + "/constancia"; }

    private static String newTask(String title) {
        return "{\"projectId\":\"" + PROJECT + "\",\"title\":\"" + title + "\",\"location\":" + HERE + "}";
    }

    private static String email(String name) { return name + ".constancia." + TAG + "@example.invalid"; }

    private Browser browser(String name) throws Exception {
        var browser = new Browser();
        var answer = browser.post("/api/auth/login", "username=" + email(name).replace("@", "%40") + "&password=" + PASSWORD, browser.csrf());
        assertThat(answer.statusCode()).isEqualTo(204);
        return browser;
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
        HttpResponse<byte[]> get(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        }
        String csrf() throws Exception { return JsonPath.read(new String(get("/api/auth/csrf").body(), java.nio.charset.StandardCharsets.UTF_8), "$.token"); }
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
