package com.stisistemas.os;

import static org.assertj.core.api.Assertions.*;

import com.jayway.jsonpath.JsonPath;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
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
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> required("STI_DB_USER"));
        registry.add("spring.datasource.password", () -> required("STI_DB_PASSWORD"));
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate runtime;

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

    @Test void internalRolesSeeCreationCatalogButNoUnimplementedWrites() throws Exception {
        for (String role : new String[]{"admin", "supervisor", "usuario"}) {
            var browser = new Browser(); browser.login(role);
            assertThat(browser.get("/api/projects").body()).contains("Project A", "Project B");
            assertThat(browser.get("/api/auth/me").body()).contains(role.toUpperCase());
            assertThat(browser.post("/api/projects", "", browser.csrf()).statusCode()).isEqualTo(405);
        }
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
        var newClient = new Browser();
        assertThat(newClient.post("/api/auth/login", "username=" + account + "&password=" + PASSWORD, newClient.csrf()).statusCode()).isEqualTo(204);
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
        assertThat(customer.post("/api/auth/login", "username=" + email + "&password=" + PASSWORD, customer.csrf()).statusCode()).isEqualTo(204);
        assertThat(customer.get("/api/clients").body()).contains("New company").doesNotContain("Synthetic A", "Synthetic B");
        assertThat(customer.get("/api/projects").body()).doesNotContain("Project A", "Project B");
        assertThat(customer.postJson("/api/clients", "{\"name\":\"Forbidden\"}", customer.csrf()).statusCode()).isEqualTo(403);
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
