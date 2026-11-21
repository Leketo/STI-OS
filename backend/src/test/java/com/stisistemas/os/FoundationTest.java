package com.stisistemas.os;

import static org.assertj.core.api.Assertions.*;

import com.jayway.jsonpath.JsonPath;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.servlet.session.cookie.secure=false")
class FoundationTest {
    static final String PASSWORD = UUID.randomUUID().toString();
    static final UUID COMPANY_A = UUID.randomUUID();
    static final UUID COMPANY_B = UUID.randomUUID();
    static final UUID PROJECT_A = UUID.randomUUID();
    static final UUID PROJECT_B = UUID.randomUUID();
    static final String LONG_NAME = "long".repeat(28);
    /** Fixed once: a supplier that drew a new name on every read would point the test and the app to different folders. */
    static final String UPLOADS = "target/test-uploads-" + UUID.randomUUID();
    static JdbcTemplate owner;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = required("STI_DB_URL");
        String user = required("STI_MIGRATION_USER");
        String password = required("STI_MIGRATION_PASSWORD");
        Flyway.configure().dataSource(url, user, password).schemas("sti").defaultSchema("sti")
            .createSchemas(false).load().migrate();
        owner = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        owner.update("INSERT INTO sti.client VALUES (?, 'Synthetic A'), (?, 'Synthetic B')", COMPANY_A, COMPANY_B);
        owner.update("INSERT INTO sti.project VALUES (?, ?, 'Project A'), (?, ?, 'Project B')", PROJECT_A, COMPANY_A, PROJECT_B, COMPANY_B);
        String hash = new BCryptPasswordEncoder(12).encode(PASSWORD);
        for (String role : new String[]{"ADMIN", "SUPERVISOR", "USUARIO", "CLIENTE"}) {
            owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,client_id) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), role.toLowerCase() + "@example.invalid", role, hash, role, role.equals("CLIENTE") ? COMPANY_A : null);
        }
        owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,client_id) VALUES (?,?,?,?,?,?)",
            UUID.randomUUID(), "second@example.invalid", "Second client", hash, "CLIENTE", COMPANY_B);
        owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role) VALUES (?,?,?,?,?)",
            UUID.randomUUID(), LONG_NAME + "@example.invalid", "Long email", hash, "USUARIO");
        owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role) VALUES (?,?,?,?,?)",
            UUID.randomUUID(), "tecnico2@example.invalid", "Second technician", hash, "USUARIO");
        registry.add("sti.uploads.dir", () -> UPLOADS);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> required("STI_DB_USER"));
        registry.add("spring.datasource.password", () -> required("STI_DB_PASSWORD"));
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate runtime;

    /** Rounds of every concurrency test (ENCARGO-DEV-001, CA-02 to CA-04). Each round reports whether it failed. */
    static final int ROUNDS = 10;

    @Test void unauthenticatedRequestsAndInvalidCredentialsAreRejected() throws Exception {
        var browser = new Browser();
        assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(browser.get("/api/projects").statusCode()).isEqualTo(401);
        assertThat(browser.post("/api/auth/login", "username=admin%40example.invalid&password=wrong", browser.csrf()).statusCode()).isEqualTo(401);
    }

    @Test void loginNormalizesEmailCase() throws Exception {
        var browser = new Browser();
        browser.login("ADMIN");
        assertThat(browser.get("/api/auth/me").body()).contains("admin@example.invalid");
    }

    @Test void csrfProtectsBothLoginAndLogout() throws Exception {
        var browser = new Browser();
        assertThat(browser.post("/api/auth/login", "username=admin%40example.invalid&password=" + PASSWORD, null).statusCode()).isEqualTo(403);
        browser.login("admin");
        assertThat(browser.post("/api/auth/logout", "", null).statusCode()).isEqualTo(403);
        assertThat(browser.post("/api/auth/logout", "", "invalid").statusCode()).isEqualTo(403);
        assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(200);
    }

    @Test void sessionRotatesPersistsAndLogoutRevokesOldCookie() throws Exception {
        var browser = new Browser();
        String csrf = browser.csrf();
        String anonymous = browser.cookie();
        var login = browser.post("/api/auth/login", "username=admin%40example.invalid&password=" + PASSWORD, csrf);
        assertThat(login.statusCode()).isEqualTo(204);
        String authenticated = browser.cookie();
        assertThat(authenticated).isNotEqualTo(anonymous);
        assertThat(login.headers().allValues("set-cookie").toString()).contains("HttpOnly", "SameSite=Lax");
        assertThat(runtime.queryForObject("SELECT count(*) FROM sti.spring_session WHERE principal_name = 'admin@example.invalid'", Integer.class)).isGreaterThan(0);
        assertThat(browser.get("/api/auth/me").body()).contains("ADMIN").doesNotContain("password");
        assertThat(browser.post("/api/auth/logout", "", browser.csrf()).statusCode()).isEqualTo(204);
        var replay = HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri("/api/auth/me")).header("Cookie", authenticated).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(replay.statusCode()).isEqualTo(401);
    }

    @Test void customerCannotReadAnotherCompanyOrProject() throws Exception {
        var browser = new Browser(); browser.login("cliente");
        assertThat(browser.get("/api/clients").body()).contains("Synthetic A").doesNotContain("Synthetic B");
        assertThat(browser.get("/api/projects").body()).contains("Project A").doesNotContain("Project B");
        assertThat(browser.get("/api/projects/" + PROJECT_A).statusCode()).isEqualTo(200);
        assertThat(browser.get("/api/projects/" + PROJECT_B).statusCode()).isEqualTo(404);
        var second = new Browser(); second.login("second");
        assertThat(second.get("/api/projects/" + PROJECT_A).statusCode()).isEqualTo(404);
    }

    @Test void internalRolesSeeCreationCatalogAndOnlyAdminCreatesProjects() throws Exception {
        for (String role : new String[]{"admin", "supervisor", "usuario"}) {
            var browser = new Browser(); browser.login(role);
            assertThat(browser.get("/api/projects").body()).contains("Project A", "Project B");
            assertThat(browser.get("/api/auth/me").body()).contains(role.toUpperCase());
        }
        String input = "{\"clientId\":\"" + COMPANY_A + "\",\"name\":\"Obra nueva\"}";
        var supervisor = new Browser(); supervisor.login("supervisor");
        assertThat(supervisor.postJson("/api/projects", input, supervisor.csrf()).statusCode()).isEqualTo(403);
        var admin = new Browser(); admin.login("admin");
        assertThat(admin.postJson("/api/projects", input, null).statusCode()).isEqualTo(403);
        assertThat(admin.postJson("/api/projects", "{\"clientId\":\"" + COMPANY_A + "\",\"name\":\"  \"}", admin.csrf()).statusCode()).isEqualTo(400);
        assertThat(admin.postJson("/api/projects", "{\"clientId\":\"" + UUID.randomUUID() + "\",\"name\":\"Obra\"}", admin.csrf()).statusCode()).isEqualTo(400);
        var created = admin.postJson("/api/projects", input, admin.csrf());
        assertThat(created.statusCode()).isEqualTo(201);
        UUID project = UUID.fromString(JsonPath.read(created.body(), "$.id"));
        var customer = new Browser(); customer.login("cliente");
        assertThat(customer.get("/api/projects").body()).contains("Obra nueva");
        assertThat(customer.postJson("/api/tasks", newTask(project, "En la obra nueva", HERE), customer.csrf()).statusCode()).isEqualTo(201);
        var other = new Browser(); other.login("second");
        assertThat(other.get("/api/projects").body()).doesNotContain("Obra nueva");
    }

    @Test void disabledAccountsLoseExistingAccess() throws Exception {
        var browser = new Browser(); browser.login("second");
        owner.update("UPDATE sti.app_user SET enabled=false WHERE email='second@example.invalid'");
        try {
            assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(401);
            assertThat(browser.get("/api/projects").statusCode()).isEqualTo(401);
        } finally { owner.update("UPDATE sti.app_user SET enabled=true WHERE email='second@example.invalid'"); }
    }

    @Test void expiredSessionCannotReadCatalog() throws Exception {
        var browser = new Browser(); browser.login("supervisor");
        owner.update("UPDATE sti.spring_session SET last_access_time=0, expiry_time=0 WHERE principal_name='supervisor@example.invalid'");
        assertThat(browser.get("/api/projects").statusCode()).isEqualTo(401);
    }

    @Test void runtimeCannotPerformDdlOrCreateRoles() {
        assertThatThrownBy(() -> runtime.execute("CREATE TABLE sti.forbidden(id integer)")).rootCause().extracting("SQLState").isEqualTo("42501");
        assertThatThrownBy(() -> runtime.execute("ALTER TABLE sti.client ADD COLUMN forbidden integer")).rootCause().extracting("SQLState").isEqualTo("42501");
        assertThatThrownBy(() -> runtime.execute("CREATE ROLE forbidden")).rootCause().extracting("SQLState").isEqualTo("42501");
    }

    @Test void readinessChecksMigratedDatabase() throws Exception {
        assertThat(new Browser().get("/api/health").statusCode()).isEqualTo(200);
    }

    @Test void longAccountEmailPersistsInSession() throws Exception {
        var browser = new Browser(); browser.login(LONG_NAME);
        assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(200);
        assertThat(runtime.queryForObject("SELECT count(*) FROM sti.spring_session WHERE principal_name=?", Integer.class,
            LONG_NAME + "@example.invalid")).isEqualTo(1);
    }

    @Test void onlyCurrentAdminCanProvisionAccountsAndClientMustHaveOneCompany() throws Exception {
        String account = "new-client-" + UUID.randomUUID() + "@example.invalid";
        String client = "{\"name\":\"New client\",\"email\":\"" + account
            + "\",\"password\":\"" + PASSWORD + "\",\"role\":\"CLIENTE\",\"clientId\":\"" + COMPANY_B + "\"}";
        var operator = new Browser(); operator.login("supervisor");
        assertThat(operator.postJson("/api/accounts", client, operator.csrf()).statusCode()).isEqualTo(403);
        var admin = new Browser(); admin.login("admin");
        assertThat(admin.postJson("/api/accounts", client, null).statusCode()).isEqualTo(403);
        assertThat(admin.postJson("/api/accounts", client.replace("\"CLIENTE\"", "null"), admin.csrf()).statusCode()).isEqualTo(400);
        assertThat(admin.postJson("/api/accounts", client.replace("\"clientId\":\"" + COMPANY_B + "\"", "\"clientId\":null"), admin.csrf()).statusCode()).isEqualTo(400);
        assertThat(admin.postJson("/api/accounts", client.replace(COMPANY_B.toString(), UUID.randomUUID().toString()), admin.csrf()).statusCode()).isEqualTo(400);
        var created = admin.postJson("/api/accounts", client, admin.csrf());
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(created.body()).contains(account, COMPANY_B.toString()).doesNotContain(PASSWORD, "password_hash");
        assertThat(admin.postJson("/api/accounts", client, admin.csrf()).statusCode()).isEqualTo(409);
        // D-23 (corte 2): the password the admin sent is ignored; the account opens with the one the system drew.
        var newClient = new Browser();
        assertThat(newClient.post("/api/auth/login", "username=" + account + "&password=" + PASSWORD, newClient.csrf()).statusCode()).isEqualTo(401);
        firstSignIn(newClient, account, JsonPath.read(created.body(), "$.initialPassword"));
        assertThat(newClient.get("/api/projects").body()).contains("Project B").doesNotContain("Project A");
        assertThat(newClient.postJson("/api/accounts", client, newClient.csrf()).statusCode()).isEqualTo(403);
    }

    @Test void adminCreatesCompanyAndCustomerAccountSeesOnlyThatCompany() throws Exception {
        var operator = new Browser(); operator.login("supervisor");
        assertThat(operator.postJson("/api/clients", "{\"name\":\"New company\"}", operator.csrf()).statusCode()).isEqualTo(403);
        var admin = new Browser(); admin.login("admin");
        assertThat(admin.postJson("/api/clients", "{\"name\":\"New company\"}", null).statusCode()).isEqualTo(403);
        assertThat(admin.postJson("/api/clients", "{\"name\":\"   \"}", admin.csrf()).statusCode()).isEqualTo(400);
        var created = admin.postJson("/api/clients", "{\"name\":\"  New company  \"}", admin.csrf());
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(created.body()).contains("New company").doesNotContain("password");
        UUID clientId = UUID.fromString(JsonPath.read(created.body(), "$.id"));

        String email = "new-company-" + UUID.randomUUID() + "@example.invalid";
        String input = "{\"name\":\"New customer\",\"email\":\"" + email
            + "\",\"password\":\"" + PASSWORD + "\",\"role\":\"CLIENTE\",\"clientId\":\"" + clientId + "\"}";
        var account = admin.postJson("/api/accounts", input, admin.csrf());
        assertThat(account.statusCode()).isEqualTo(201);
        assertThat(account.body()).contains(email, clientId.toString()).doesNotContain(PASSWORD, "password_hash");
        var customer = new Browser();
        firstSignIn(customer, email, JsonPath.read(account.body(), "$.initialPassword"));
        assertThat(customer.get("/api/clients").body()).contains("New company").doesNotContain("Synthetic A", "Synthetic B");
        assertThat(customer.get("/api/projects").body()).doesNotContain("Project A", "Project B");
        assertThat(customer.postJson("/api/clients", "{\"name\":\"Forbidden\"}", customer.csrf()).statusCode()).isEqualTo(403);
    }

    @Test void taskReachesFinishedOnlyWhenEveryAssigneeConfirms() throws Exception {
        UUID operatorId = userId("usuario");
        var supervisor = new Browser(); supervisor.login("supervisor");
        var created = supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Instalación de rack", HERE), supervisor.csrf());
        assertThat(created.statusCode()).isEqualTo(201);
        String task = JsonPath.read(created.body(), "$.id");
        assertThat(created.body()).contains("\"status\":\"POR_HACER\"").contains("\"code\":\"TAR-");

        assertThat(supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + operatorId + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
        var both = supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("supervisor") + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf());
        assertThat(both.statusCode()).isEqualTo(200);
        assertThat(both.body()).contains("\"confirmed\":0", "\"pending\":2");

        var worker = new Browser(); worker.login("usuario");
        assertThat(worker.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", worker.csrf()).statusCode()).isEqualTo(200);
        var first = worker.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", worker.csrf());
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(first.body()).contains("\"status\":\"EN_PROCESO\"", "\"confirmed\":1", "\"pending\":1");
        assertThat(worker.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", worker.csrf()).body())
            .contains("\"confirmed\":1");

        var last = supervisor.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", supervisor.csrf());
        assertThat(last.body()).contains("\"status\":\"FINALIZADO\"");

        var back = supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf());
        assertThat(back.body()).contains("\"status\":\"EN_PROCESO\"", "\"confirmed\":0", "\"pending\":2");
        assertThat(supervisor.get("/api/tasks/" + task).body()).contains("CONFIRMACION", "ESTADO", "ASIGNADA", "CREADA");
    }

    @Test void taskRulesRejectForbiddenActorsAndTransitions() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Cableado", HERE), supervisor.csrf()).body(), "$.id");

        var worker = new Browser(); worker.login("usuario");
        assertThat(worker.get("/api/tasks/" + task).statusCode()).isEqualTo(404);
        assertThat(worker.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("usuario") + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", worker.csrf()).statusCode()).isEqualTo(404);
        assertThat(supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("usuario") + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(worker.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("supervisor") + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", worker.csrf()).statusCode()).isEqualTo(403);
        assertThat(worker.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", worker.csrf()).statusCode()).isEqualTo(400);
        assertThat(worker.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", worker.csrf()).statusCode()).isEqualTo(200);
        assertThat(worker.postJson("/api/tasks/" + task + "/status", "{\"to\":\"POR_HACER\",\"location\":" + HERE + "}", worker.csrf()).statusCode()).isEqualTo(403);
        assertThat(worker.postJson("/api/tasks/" + task + "/status", "{\"to\":\"ANULADA\",\"location\":" + HERE + "}", worker.csrf()).statusCode()).isEqualTo(403);
        assertThat(worker.postJson("/api/tasks/" + task + "/status", "{\"to\":\"FINALIZADO\",\"location\":" + HERE + "}", worker.csrf()).statusCode()).isEqualTo(400);
        assertThat(worker.postJson("/api/tasks/" + task + "/status", "{\"to\":\"FACTURADO\",\"location\":" + HERE + "}", worker.csrf()).statusCode()).isEqualTo(403);
        assertThat(worker.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", null).statusCode()).isEqualTo(403);

        var customer = new Browser(); customer.login("cliente");
        assertThat(customer.get("/api/tasks/" + task).statusCode()).isEqualTo(200);
        assertThat(customer.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", customer.csrf()).statusCode()).isEqualTo(403);
        assertThat(customer.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", customer.csrf()).statusCode()).isEqualTo(403);
        assertThat(customer.postJson("/api/tasks", newTask(PROJECT_B, "Ajena", HERE), customer.csrf()).statusCode()).isEqualTo(400);
        assertThat(customer.get("/api/operators").statusCode()).isEqualTo(403);
        assertThat(supervisor.get("/api/operators").body()).contains("USUARIO").doesNotContain("CLIENTE");
    }

    @Test void everyStepKeepsLocationOrAnExplicitReason() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        assertThat(supervisor.postJson("/api/tasks", "{\"projectId\":\"" + PROJECT_A + "\",\"title\":\"Sin ubicación\"}", supervisor.csrf()).statusCode()).isEqualTo(400);
        assertThat(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Vacía", "{}"), supervisor.csrf()).statusCode()).isEqualTo(400);
        assertThat(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Ambigua", "{\"latitude\":-25.3,\"longitude\":-57.6,\"absentReason\":\"sin señal\"}"), supervisor.csrf()).statusCode()).isEqualTo(400);
        assertThat(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Fuera de rango", "{\"latitude\":-125.0,\"longitude\":-57.6}"), supervisor.csrf()).statusCode()).isEqualTo(400);
        assertThat(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "   ", HERE), supervisor.csrf()).statusCode()).isEqualTo(400);

        var created = supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Depósito sin señal", "{\"absentReason\":\"El dispositivo no obtuvo coordenadas\"}"), supervisor.csrf());
        assertThat(created.statusCode()).isEqualTo(201);
        String task = JsonPath.read(created.body(), "$.id");
        var detail = supervisor.get("/api/tasks/" + task);
        assertThat(detail.body()).contains("El dispositivo no obtuvo coordenadas", "\"kind\":\"CREADA\"");
        // D-26, rule 1: a task starts only with someone assigned.
        assertThat(supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("supervisor") + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(supervisor.get("/api/tasks/" + task).body()).contains("-25.3", "-57.6");
    }

    @Test void customerSeesOnlyItsCompanyAndAdminKeepsCancelledTasksApart() throws Exception {
        var customer = new Browser(); customer.login("cliente");
        var created = customer.postJson("/api/tasks", newTask(PROJECT_A, "Solicitud del cliente", HERE), customer.csrf());
        assertThat(created.statusCode()).isEqualTo(201);
        String task = JsonPath.read(created.body(), "$.id");
        assertThat(created.body()).contains("\"assignees\":[]", "\"status\":\"POR_HACER\"");

        var other = new Browser(); other.login("second");
        assertThat(other.get("/api/tasks/" + task).statusCode()).isEqualTo(404);
        assertThat(other.get("/api/tasks").body()).doesNotContain("Solicitud del cliente");
        assertThat(customer.get("/api/tasks?projectId=" + PROJECT_A).body()).contains("Solicitud del cliente");

        var admin = new Browser(); admin.login("admin");
        assertThat(admin.postJson("/api/tasks/" + task + "/status", "{\"to\":\"ANULADA\",\"location\":" + HERE + "}", admin.csrf()).body())
            .contains("\"status\":\"ANULADA\"");
        assertThat(customer.get("/api/tasks/" + task).statusCode()).isEqualTo(404);
        var supervisor = new Browser(); supervisor.login("supervisor");
        assertThat(supervisor.get("/api/tasks/" + task).statusCode()).isEqualTo(404);
        assertThat(supervisor.get("/api/tasks?status=ANULADA").statusCode()).isEqualTo(403);
        assertThat(admin.get("/api/tasks?status=ANULADA").body()).contains("Solicitud del cliente");
        assertThat(admin.get("/api/tasks").body()).doesNotContain("Solicitud del cliente");
        assertThat(admin.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", admin.csrf()).statusCode()).isEqualTo(400);
        assertThat(admin.get("/api/tasks?status=INVENTADO").statusCode()).isEqualTo(400);
    }

    @Test void signatureUnlocksInvoicingAndReopeningSupersedesIt() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        var admin = new Browser(); admin.login("admin");
        String task = finished(supervisor);

        assertThat(admin.postJson("/api/tasks/" + task + "/status", "{\"to\":\"FACTURADO\",\"location\":" + HERE + "}", admin.csrf()).statusCode()).isEqualTo(400);
        String signature = "{\"signerName\":\"Jefe de tienda\",\"signedOn\":\"2026-10-26\",\"image\":\"" + PNG_BASE64 + "\",\"location\":" + HERE + "}";
        assertThat(supervisor.postJson("/api/tasks/" + task + "/signature", signature.replace(PNG_BASE64, "no-es-png"), supervisor.csrf()).statusCode()).isEqualTo(400);
        assertThat(supervisor.postJson("/api/tasks/" + task + "/signature", signature.replace("2026-10-26", "ayer"), supervisor.csrf()).statusCode()).isEqualTo(400);
        var signed = supervisor.postJson("/api/tasks/" + task + "/signature", signature, supervisor.csrf());
        assertThat(signed.statusCode()).isEqualTo(201);
        assertThat(signed.body()).contains("Jefe de tienda", "\"remote\":false", "\"current\":true");
        assertThat(supervisor.postJson("/api/tasks/" + task + "/signature", signature, supervisor.csrf()).statusCode()).isEqualTo(409);
        assertThat(supervisor.getBytes("/api/tasks/" + task + "/signature").body()).isEqualTo(Base64.getDecoder().decode(PNG_BASE64));
        assertThat(supervisor.get("/api/tasks/" + task).body()).contains("\"signed\":true", "\"kind\":\"FIRMA\"");

        // D-207 (corte 3A): the SUPERVISOR invoices too; until v0.2.1 this answered 403.
        var invoiced = supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"FACTURADO\",\"location\":" + HERE + "}", supervisor.csrf());
        assertThat(invoiced.body()).contains("\"status\":\"FACTURADO\"");
        assertThat(admin.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", admin.csrf()).statusCode()).isEqualTo(400);
        var worker = new Browser(); worker.login("usuario");
        assertThat(worker.get("/api/tasks/" + task).statusCode()).isEqualTo(404);

        String reopened = finished(supervisor);
        assertThat(supervisor.postJson("/api/tasks/" + reopened + "/signature", signature, supervisor.csrf()).statusCode()).isEqualTo(201);
        assertThat(supervisor.postJson("/api/tasks/" + reopened + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).body())
            .contains("\"signed\":false");
        assertThat(supervisor.get("/api/tasks/" + reopened).body()).contains("\"current\":false", "Jefe de tienda");
        assertThat(supervisor.postJson("/api/tasks/" + reopened + "/signature", signature, supervisor.csrf()).statusCode()).isEqualTo(400);
    }

    @Test void photosAreLimitedToFiveRealImagesInsideVisibleTasks() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Con fotos", HERE), supervisor.csrf()).body(), "$.id");

        assertThat(supervisor.postFile("/api/tasks/" + task + "/photos", "no soy una imagen".getBytes(), "x.jpg", supervisor.csrf()).statusCode()).isEqualTo(415);
        assertThat(supervisor.postFile("/api/tasks/" + task + "/photos", JPEG, "foto.jpg", null).statusCode()).isEqualTo(403);
        var stored = supervisor.postFile("/api/tasks/" + task + "/photos", JPEG, "foto.jpg", supervisor.csrf());
        assertThat(stored.statusCode()).isEqualTo(201);
        assertThat(stored.body()).contains("image/jpeg", "SUPERVISOR");
        UUID photo = UUID.fromString(JsonPath.read(stored.body(), "$.id"));
        var download = supervisor.getBytes("/api/tasks/" + task + "/photos/" + photo);
        assertThat(download.statusCode()).isEqualTo(200);
        assertThat(download.body()).isEqualTo(JPEG);
        assertThat(download.headers().firstValue("content-type")).contains("image/jpeg");

        var customer = new Browser(); customer.login("cliente");
        assertThat(customer.postFile("/api/tasks/" + task + "/photos", Base64.getDecoder().decode(PNG_BASE64), "p.png", customer.csrf()).statusCode()).isEqualTo(201);
        var other = new Browser(); other.login("second");
        assertThat(other.getBytes("/api/tasks/" + task + "/photos/" + photo).statusCode()).isEqualTo(404);
        assertThat(other.postFile("/api/tasks/" + task + "/photos", JPEG, "foto.jpg", other.csrf()).statusCode()).isEqualTo(404);

        for (int extra = 0; extra < 3; extra++) {
            assertThat(supervisor.postFile("/api/tasks/" + task + "/photos", JPEG, "foto.jpg", supervisor.csrf()).statusCode()).isEqualTo(201);
        }
        assertThat(supervisor.get("/api/tasks/" + task).body()).contains("\"photoCount\":5");
        assertThat(supervisor.postFile("/api/tasks/" + task + "/photos", JPEG, "sexta.jpg", supervisor.csrf()).statusCode()).isEqualTo(409);
        assertThat(supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"ANULADA\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(403);
    }

    /** CA-02 (N-11): two technicians confirm at once; the task must finish, with one status change. */
    @Test void simultaneousLastConfirmationsFinishTheTask() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        List<String> failures = new ArrayList<>();
        for (int round = 1; round <= ROUNDS; round++) {
            String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Confirmación simultánea " + round, HERE), supervisor.csrf()).body(), "$.id");
            for (String person : new String[]{"usuario", "tecnico2"}) {
                assertThat(supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId(person) + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
            }
            assertThat(supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
            var first = new Browser(); first.login("usuario");
            var second = new Browser(); second.login("tecnico2");
            String firstToken = first.csrf(), secondToken = second.csrf();
            String body = "{\"location\":" + HERE + "}";
            var answers = together(List.<Callable<Integer>>of(
                () -> first.postJson("/api/tasks/" + task + "/confirmations", body, firstToken).statusCode(),
                () -> second.postJson("/api/tasks/" + task + "/confirmations", body, secondToken).statusCode()));
            String status = owner.queryForObject("SELECT status FROM sti.task WHERE id = ?::uuid", String.class, task);
            int confirmations = count("SELECT count(*) FROM sti.task_event WHERE task_id = ?::uuid AND kind = 'CONFIRMACION'", task);
            int finishes = count("SELECT count(*) FROM sti.task_event WHERE task_id = ?::uuid AND kind = 'ESTADO' AND to_status = 'FINALIZADO'", task);
            if (!answers.equals(List.of(200, 200)) || !"FINALIZADO".equals(status) || confirmations != 2 || finishes != 1) {
                failures.add("vuelta " + round + ": respuestas " + answers + ", estado " + status + ", confirmaciones " + confirmations + ", finalizaciones " + finishes);
            }
        }
        report("CA-02", failures);
    }

    /** CA-03 (N-12): four uploads at once onto a task with four photos; exactly one more fits. */
    @Test void simultaneousUploadsStopAtFivePhotos() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        List<String> failures = new ArrayList<>();
        for (int round = 1; round <= ROUNDS; round++) {
            String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Fotos simultáneas " + round, HERE), supervisor.csrf()).body(), "$.id");
            for (int photo = 0; photo < 4; photo++) {
                assertThat(supervisor.postFile("/api/tasks/" + task + "/photos", JPEG, "foto.jpg", supervisor.csrf()).statusCode()).isEqualTo(201);
            }
            List<Callable<Integer>> uploads = new ArrayList<>();
            for (int sender = 0; sender < 4; sender++) {
                var browser = new Browser(); browser.login("supervisor");
                String token = browser.csrf();
                uploads.add(() -> browser.postFile("/api/tasks/" + task + "/photos", JPEG, "foto.jpg", token).statusCode());
            }
            var answers = together(uploads);
            int rows = count("SELECT count(*) FROM sti.task_photo WHERE task_id = ?::uuid", task);
            long files = owner.queryForList("SELECT storage_name FROM sti.task_photo WHERE task_id = ?::uuid", String.class, task)
                .stream().filter(name -> Files.isRegularFile(Path.of(UPLOADS, name))).count();
            long created = answers.stream().filter(code -> code == 201).count();
            long refused = answers.stream().filter(code -> code == 409).count();
            boolean disk = orphanFree();
            if (rows != 5 || files != 5 || created != 1 || refused != 3 || !disk) {
                failures.add("vuelta " + round + ": respuestas " + answers + ", filas " + rows + ", archivos " + files + ", disco = base " + disk);
            }
        }
        report("CA-03", failures);
    }

    /** CA-04 (N-13): two signatures at once; one stays current, the other gets a clear 409 and leaves no file. */
    @Test void simultaneousSignaturesKeepOneAndAnswerConflict() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        String signature = "{\"signerName\":\"Encargado\",\"signedOn\":\"2026-11-19\",\"image\":\"" + PNG_BASE64 + "\",\"location\":" + HERE + "}";
        List<String> failures = new ArrayList<>();
        for (int round = 1; round <= ROUNDS; round++) {
            String task = finished(supervisor);
            var presenter = new Browser(); presenter.login("supervisor");
            var customer = new Browser(); customer.login("cliente");
            String presenterToken = presenter.csrf(), customerToken = customer.csrf();
            var answers = together(List.<Callable<HttpResponse<String>>>of(
                () -> presenter.postJson("/api/tasks/" + task + "/signature", signature, presenterToken),
                () -> customer.postJson("/api/tasks/" + task + "/signature", signature, customerToken)));
            List<Integer> codes = answers.stream().map(HttpResponse::statusCode).sorted().toList();
            boolean clear = answers.stream().filter(answer -> answer.statusCode() == 409)
                .allMatch(answer -> answer.body().contains("ya tiene una firma vigente"));
            int current = count("SELECT count(*) FROM sti.task_signature WHERE task_id = ?::uuid AND superseded_at IS NULL", task);
            boolean disk = orphanFree();
            if (!codes.equals(List.of(201, 409)) || !clear || current != 1 || !disk) {
                failures.add("vuelta " + round + ": respuestas " + codes + ", mensaje claro " + clear + ", vigentes " + current + ", disco = base " + disk);
            }
        }
        report("CA-04", failures);
    }

    /** CA-05 (N-14, D-26 rule 1): a task without assignees cannot start, and stays where it was. */
    @Test void taskWithoutAssigneesCannotStart() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Sin técnicos", HERE), supervisor.csrf()).body(), "$.id");
        var refused = supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf());
        assertThat(refused.statusCode()).isEqualTo(409);
        assertThat(refused.body()).contains("SIN_ASIGNADOS", "No se puede iniciar una tarea sin personas asignadas");
        assertThat(owner.queryForObject("SELECT status FROM sti.task WHERE id = ?::uuid", String.class, task)).isEqualTo("POR_HACER");
        assertThat(count("SELECT count(*) FROM sti.task_event WHERE task_id = ?::uuid AND kind = 'ESTADO'", task)).isZero();
    }

    /** CA-06 (N-14, D-26 rule 2): removing the only pending assignee finishes the task, and the log says why. */
    @Test void removingTheOnlyPendingAssigneeFinishesTheTask() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Uno confirma, otro se va", HERE), supervisor.csrf()).body(), "$.id");
        for (String person : new String[]{"usuario", "tecnico2"}) {
            assertThat(supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId(person) + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
        }
        assertThat(supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
        var worker = new Browser(); worker.login("usuario");
        assertThat(worker.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", worker.csrf()).statusCode()).isEqualTo(200);

        var removed = supervisor.send("DELETE", "/api/tasks/" + task + "/assignments/" + userId("tecnico2"), supervisor.csrf());
        assertThat(removed.statusCode()).isEqualTo(200);
        assertThat(removed.body()).contains("\"status\":\"FINALIZADO\"");
        assertThat(owner.queryForObject("SELECT status FROM sti.task WHERE id = ?::uuid", String.class, task)).isEqualTo("FINALIZADO");
        var finish = owner.queryForMap("SELECT actor_id, subject_id, location_absent_reason FROM sti.task_event"
            + " WHERE task_id = ?::uuid AND kind = 'ESTADO' AND to_status = 'FINALIZADO'", task);
        assertThat(finish.get("actor_id")).isEqualTo(userId("supervisor"));
        assertThat(finish.get("subject_id")).isEqualTo(userId("tecnico2"));
        assertThat((String) finish.get("location_absent_reason")).contains("Finalizada al quitar a la única persona pendiente");
        assertThat(count("SELECT count(*) FROM sti.task_event WHERE task_id = ?::uuid AND kind = 'DESASIGNADA'", task)).isEqualTo(1);

        // Removing someone who already confirmed while another is still pending changes nothing else.
        String other = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Se va el que confirmó", HERE), supervisor.csrf()).body(), "$.id");
        for (String person : new String[]{"usuario", "tecnico2"}) {
            supervisor.postJson("/api/tasks/" + other + "/assignments", "{\"userId\":\"" + userId(person) + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf());
        }
        supervisor.postJson("/api/tasks/" + other + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf());
        worker.postJson("/api/tasks/" + other + "/confirmations", "{\"location\":" + HERE + "}", worker.csrf());
        assertThat(supervisor.send("DELETE", "/api/tasks/" + other + "/assignments/" + userId("usuario"), supervisor.csrf()).body())
            .contains("\"status\":\"EN_PROCESO\"", "\"pending\":1");
    }

    /** CA-07 (N-14, D-26 rule 3): the last assignee of a task in progress cannot be removed; nothing changes. */
    @Test void lastAssigneeOfATaskInProgressCannotBeRemoved() throws Exception {
        var supervisor = new Browser(); supervisor.login("supervisor");
        String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Último técnico", HERE), supervisor.csrf()).body(), "$.id");
        assertThat(supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("usuario") + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);

        var refused = supervisor.send("DELETE", "/api/tasks/" + task + "/assignments/" + userId("usuario"), supervisor.csrf());
        assertThat(refused.statusCode()).isEqualTo(409);
        assertThat(refused.body()).contains("ULTIMO_ASIGNADO", "Asigná a otra persona antes, o volvé la tarea a Por hacer");
        assertThat(owner.queryForObject("SELECT status FROM sti.task WHERE id = ?::uuid", String.class, task)).isEqualTo("EN_PROCESO");
        assertThat(count("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?::uuid", task)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM sti.task_event WHERE task_id = ?::uuid AND kind = 'DESASIGNADA'", task)).isZero();

        // Before starting, the last assignee can still be removed: rule 1 keeps that task from starting empty.
        assertThat(supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"POR_HACER\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(supervisor.send("DELETE", "/api/tasks/" + task + "/assignments/" + userId("usuario"), supervisor.csrf()).statusCode()).isEqualTo(200);
    }

    /** Runs the actions at once: each on its own thread, session and connection, released together by a barrier. */
    private static <T> List<T> together(List<Callable<T>> actions) throws Exception {
        var barrier = new CyclicBarrier(actions.size());
        var pool = Executors.newFixedThreadPool(actions.size());
        try {
            List<Future<T>> pending = new ArrayList<>();
            for (var action : actions) {
                pending.add(pool.submit(() -> { barrier.await(10, TimeUnit.SECONDS); return action.call(); }));
            }
            List<T> results = new ArrayList<>();
            for (var result : pending) results.add(result.get(60, TimeUnit.SECONDS));
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    /** Files on disk equal the photo and signature rows: no file without its row anywhere in this run. */
    private boolean orphanFree() throws Exception {
        long files = 0;
        if (Files.isDirectory(Path.of(UPLOADS))) {
            try (var listing = Files.list(Path.of(UPLOADS))) { files = listing.filter(Files::isRegularFile).count(); }
        }
        return files == count("SELECT (SELECT count(*) FROM sti.task_photo) + (SELECT count(*) FROM sti.task_signature)");
    }

    private static int count(String sql, Object... parameters) {
        Integer value = owner.queryForObject(sql, Integer.class, parameters);
        return value == null ? 0 : value;
    }

    private static void report(String criterion, List<String> failures) {
        System.out.println(criterion + ": " + failures.size() + " de " + ROUNDS + " vueltas con falla");
        failures.forEach(failure -> System.out.println(criterion + " " + failure));
        assertThat(failures).as(criterion + ": vueltas con falla").isEmpty();
    }

    /** A task carried to FINALIZADO by its single assignee, ready to be signed. */
    private String finished(Browser supervisor) throws Exception {
        String task = JsonPath.read(supervisor.postJson("/api/tasks", newTask(PROJECT_A, "Trabajo terminado", HERE), supervisor.csrf()).body(), "$.id");
        assertThat(supervisor.postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("supervisor") + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(supervisor.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(supervisor.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", supervisor.csrf()).body())
            .contains("\"status\":\"FINALIZADO\"");
        return task;
    }

    private static final String PNG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0};
    private static final String HERE = "{\"latitude\":-25.3,\"longitude\":-57.6,\"accuracyM\":12.5}";
    private static String newTask(UUID project, String title, String location) {
        return "{\"projectId\":\"" + project + "\",\"title\":\"" + title + "\",\"location\":" + location + "}";
    }
    private static UUID userId(String role) {
        return owner.queryForObject("SELECT id FROM sti.app_user WHERE email = ?", UUID.class, role + "@example.invalid");
    }

    /** Signs in with the initial password and replaces it, as the first sign-in screen does (D-23). */
    private static void firstSignIn(Browser browser, String email, String initialPassword) throws Exception {
        assertThat(browser.post("/api/auth/login", "username=" + email + "&password="
            + java.net.URLEncoder.encode(initialPassword, java.nio.charset.StandardCharsets.UTF_8), browser.csrf()).statusCode()).isEqualTo(204);
        assertThat(browser.postJson("/api/auth/password", "{\"newPassword\":\"" + UUID.randomUUID() + "\"}", browser.csrf()).statusCode()).isEqualTo(204);
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalStateException("Use scripts/test-local.ps1; missing " + key);
        return value;
    }

    class Browser {
        final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();
        HttpResponse<String> get(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
        }
        String csrf() throws Exception { return JsonPath.read(get("/api/auth/csrf").body(), "$.token"); }
        String cookie() { return "STI_SESSION=" + cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("STI_SESSION")).findFirst().orElseThrow().getValue(); }
        HttpResponse<String> post(String path, String body, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/x-www-form-urlencoded");
            if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
            return client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        }
        HttpResponse<byte[]> getBytes(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        }
        HttpResponse<String> postFile(String path, byte[] content, String filename, String csrf) throws Exception {
            String boundary = "----sti" + UUID.randomUUID();
            var body = new java.io.ByteArrayOutputStream();
            body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + filename
                + "\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            body.write(content);
            body.write(("\r\n--" + boundary + "--\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "multipart/form-data; boundary=" + boundary);
            if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
            return client.send(request.POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build(),
                HttpResponse.BodyHandlers.ofString());
        }
        HttpResponse<String> send(String method, String path, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path));
            if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
            return client.send(request.method(method, HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        }
        HttpResponse<String> postJson(String path, String body, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
            if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
            return client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        }
        void login(String name) throws Exception {
            assertThat(post("/api/auth/login", "username=" + name + "%40example.invalid&password=" + PASSWORD, csrf()).statusCode()).isEqualTo(204);
        }
    }
}
