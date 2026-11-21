package com.stisistemas.os;

import static org.assertj.core.api.Assertions.*;

import com.jayway.jsonpath.JsonPath;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Corte 2, users and passwords (ENCARGO-DEV-002). This class runs against a database that held data at schema 3
 * and was then migrated: every account here existed before V4, as in production (CA-24). The clean install is the
 * other test class, whose database starts empty.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.servlet.session.cookie.secure=false")
@ExtendWith(OutputCaptureExtension.class)
@SuppressWarnings("unchecked")
class AccountsTest {
    static final String PASSWORD = UUID.randomUUID().toString();
    static final UUID COMPANY_A = UUID.randomUUID();
    static final UUID COMPANY_B = UUID.randomUUID();
    static final UUID PROJECT_A = UUID.randomUUID();
    static final String[] EXISTING = {"admin", "admin2", "supervisor", "usuario", "cliente"};
    static final Map<String, String> HASHES_BEFORE_V4 = new java.util.HashMap<>();
    static int accountsBeforeV4;
    static JdbcTemplate owner;
    static final int ROUNDS = 10;
    static final String HERE = "{\"latitude\":-25.3,\"longitude\":-57.6,\"accuracyM\":12.5}";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = required("STI_UPGRADE_DB_URL");
        String user = required("STI_MIGRATION_USER");
        String password = required("STI_MIGRATION_PASSWORD");
        // Schema 3 with data, as production stood before this cut.
        Flyway.configure().dataSource(url, user, password).schemas("sti").defaultSchema("sti")
            .createSchemas(false).target("3").load().migrate();
        owner = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        owner.update("INSERT INTO sti.client VALUES (?, 'Upgrade A'), (?, 'Upgrade B')", COMPANY_A, COMPANY_B);
        owner.update("INSERT INTO sti.project VALUES (?, ?, 'Upgrade project')", PROJECT_A, COMPANY_A);
        String hash = new BCryptPasswordEncoder(12).encode(PASSWORD);
        for (String name : EXISTING) {
            String role = name.equals("admin2") ? "ADMIN" : name.toUpperCase();
            owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,client_id) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), name + "@example.invalid", "Existing " + name, hash, role,
                role.equals("CLIENTE") ? COMPANY_A : null);
        }
        owner.query("SELECT email, password_hash FROM sti.app_user", rs -> {
            HASHES_BEFORE_V4.put(rs.getString(1), rs.getString(2));
        });
        accountsBeforeV4 = count("SELECT count(*) FROM sti.app_user");
        // Then the migration of this cut, over that data.
        Flyway.configure().dataSource(url, user, password).schemas("sti").defaultSchema("sti")
            .createSchemas(false).load().migrate();
        registry.add("sti.uploads.dir", () -> "target/test-uploads-accounts");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> required("STI_DB_USER"));
        registry.add("spring.datasource.password", () -> required("STI_DB_PASSWORD"));
    }

    @LocalServerPort int port;

    // ---------------------------------------------------------------------------------------------- CA-24

    @Test void upgradeFromSchema3KeepsAccountsAndPasswordsWithoutForcingAChange() throws Exception {
        assertThat(owner.queryForObject("SELECT max(version::int) FROM sti.flyway_schema_history WHERE success", Integer.class)).isEqualTo(6); // V6, corte 3A
        assertThat(owner.queryForList("SELECT email FROM sti.app_user", String.class)).contains(emails(EXISTING));
        for (String name : EXISTING) {
            String email = name + "@example.invalid";
            assertThat(owner.queryForObject("SELECT password_hash FROM sti.app_user WHERE email = ?", String.class, email))
                .as("hash kept for " + name).isEqualTo(HASHES_BEFORE_V4.get(email));
            assertThat(owner.queryForObject("SELECT must_change_password FROM sti.app_user WHERE email = ?", Boolean.class, email))
                .as("no forced change for " + name).isFalse();
            assertThat(owner.queryForObject("SELECT phone FROM sti.app_user WHERE email = ?", String.class, email)).isNull();
            var browser = new Browser();
            assertThat(browser.login(email, PASSWORD)).as("login of " + name).isEqualTo(204);
            assertThat(browser.get("/api/projects").statusCode()).as("normal access for " + name).isEqualTo(200);
            assertThat(browser.get("/api/auth/me").body()).contains("\"mustChangePassword\":false");
        }
        assertThat(accountsBeforeV4).isEqualTo(EXISTING.length);
    }

    // ---------------------------------------------------------------------------------------------- CA-12, rule 8, CA-23

    @Test void onlyAnAdminManagesAccounts() throws Exception {
        UUID target = id("usuario");
        String body = "{\"name\":\"Nadie\",\"email\":\"nadie-" + UUID.randomUUID() + "@example.invalid\",\"role\":\"USUARIO\"}";
        for (String name : new String[]{"supervisor", "usuario", "cliente"}) {
            var browser = new Browser(); browser.login(name);
            String csrf = browser.csrf();
            assertThat(browser.get("/api/accounts").statusCode()).as(name).isEqualTo(403);
            assertThat(browser.get("/api/accounts/" + target).statusCode()).as(name).isEqualTo(403);
            assertThat(browser.json("POST", "/api/accounts", body, csrf).statusCode()).as(name).isEqualTo(403);
            assertThat(browser.json("PUT", "/api/accounts/" + target, "{\"name\":\"X\"}", csrf).statusCode()).as(name).isEqualTo(403);
            assertThat(browser.json("POST", "/api/accounts/" + target + "/password-reset", "", csrf).statusCode()).as(name).isEqualTo(403);
        }
        var anonymous = new Browser();
        assertThat(anonymous.get("/api/accounts").statusCode()).isEqualTo(401);
        assertThat(anonymous.json("POST", "/api/auth/password", "{\"newPassword\":\"" + UUID.randomUUID() + "\"}", anonymous.csrf()).statusCode()).isEqualTo(401);
        var supervisor = new Browser(); supervisor.login("supervisor");
        assertThat(supervisor.get("/api/operators?includeInactive=true").statusCode()).isEqualTo(403);
        assertThat(count("SELECT count(*) FROM sti.app_user WHERE display_name = 'Nadie'")).isZero();
    }

    @Test void theListShowsEveryPersonWithRoleCompanyPhoneStateAndInitialPasswordMark() throws Exception {
        var admin = admin();
        var fresh = create(admin, "Lista Cliente", "CLIENTE", COMPANY_B, "+595 (21) 555-0101");
        var list = admin.get("/api/accounts");
        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(list.body()).doesNotContain("password_hash", "passwordHash", fresh.password());
        String path = "$[?(@.email == '" + fresh.email() + "')]";
        assertThat((List<String>) JsonPath.read(list.body(), path + ".clientName")).containsExactly("Upgrade B");
        assertThat((List<String>) JsonPath.read(list.body(), path + ".phone")).containsExactly("+595 (21) 555-0101");
        assertThat((List<Boolean>) JsonPath.read(list.body(), path + ".mustChangePassword")).containsExactly(true);
        assertThat((List<Boolean>) JsonPath.read(list.body(), path + ".active")).containsExactly(true);
        assertThat((List<String>) JsonPath.read(list.body(), "$[?(@.email == 'cliente@example.invalid')].clientName")).containsExactly("Upgrade A");
        assertThat((List<Boolean>) JsonPath.read(list.body(), "$[?(@.email == 'usuario@example.invalid')].mustChangePassword")).containsExactly(false);
        int listed = JsonPath.read(list.body(), "$.length()");
        assertThat(listed).isEqualTo(count("SELECT count(*) FROM sti.app_user"));
    }

    // ---------------------------------------------------------------------------------------------- CA-13

    @Test void creationDrawsADifferentPasswordShownOnceAndNeverKeptInClear(CapturedOutput output) throws Exception {
        var admin = admin();
        String typed = "Escrita-por-admin-" + UUID.randomUUID();
        List<String> drawn = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            String email = "alta-" + UUID.randomUUID() + "@example.invalid";
            var created = admin.json("POST", "/api/accounts", "{\"name\":\"Alta " + i + "\",\"email\":\"" + email
                + "\",\"password\":\"" + typed + "\",\"role\":\"USUARIO\"}", admin.csrf());
            assertThat(created.statusCode()).isEqualTo(201);
            assertThat(created.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
            String password = JsonPath.read(created.body(), "$.initialPassword");
            assertThat(password).matches("^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$").isNotEqualTo(typed);
            drawn.add(password);
            String id = JsonPath.read(created.body(), "$.account.id");
            // The admin's typed password was ignored: it does not open the account; the drawn one does.
            assertThat(new Browser().login(email, typed)).isEqualTo(401);
            assertThat(new BCryptPasswordEncoder().matches(password,
                owner.queryForObject("SELECT password_hash FROM sti.app_user WHERE email = ?", String.class, email))).isTrue();
            assertThat(owner.queryForObject("SELECT must_change_password FROM sti.app_user WHERE email = ?", Boolean.class, email)).isTrue();
            // Shown once: nothing else returns it.
            assertThat(admin.get("/api/accounts/" + id).body()).doesNotContain(password);
            assertThat(admin.get("/api/accounts").body()).doesNotContain(password);
            var person = new Browser();
            assertThat(person.login(email, password)).isEqualTo(204);
            assertThat(person.get("/api/auth/me").body()).doesNotContain(password);
        }
        assertThat(drawn.get(0)).isNotEqualTo(drawn.get(1));
        for (String password : drawn) {
            assertThat(placesHolding(password)).as("database rows holding the initial password").isEmpty();
            assertThat(output.getAll()).as("logs").doesNotContain(password);
        }
        assertThat(placesHolding(typed)).isEmpty();
    }

    @Test void creationValidatesEveryFieldAndTheCompanyOfACustomer() throws Exception {
        var admin = admin();
        String csrf = admin.csrf();
        String email = "valida-" + UUID.randomUUID() + "@example.invalid";
        assertThat(admin.json("POST", "/api/accounts", "{\"name\":\" \",\"email\":\"" + email + "\",\"role\":\"USUARIO\"}", csrf).body()).contains("NOMBRE");
        assertThat(admin.json("POST", "/api/accounts", "{\"name\":\"A\",\"email\":\"no-es-correo\",\"role\":\"USUARIO\"}", csrf).body()).contains("CORREO");
        assertThat(admin.json("POST", "/api/accounts", "{\"name\":\"A\",\"email\":\"" + email + "\",\"role\":\"JEFE\"}", csrf).body()).contains("\"ROL\"");
        assertThat(admin.json("POST", "/api/accounts", "{\"name\":\"A\",\"email\":\"" + email + "\",\"role\":\"CLIENTE\"}", csrf).body()).contains("EMPRESA");
        assertThat(admin.json("POST", "/api/accounts", "{\"name\":\"A\",\"email\":\"" + email + "\",\"role\":\"CLIENTE\",\"clientId\":\"" + UUID.randomUUID() + "\"}", csrf).body()).contains("EMPRESA");
        assertThat(admin.json("POST", "/api/accounts", "{\"name\":\"A\",\"email\":\"" + email + "\",\"role\":\"USUARIO\",\"clientId\":\"" + COMPANY_A + "\"}", csrf).body()).contains("EMPRESA");
        assertThat(admin.json("POST", "/api/accounts", "{\"name\":\"A\",\"email\":\"SUPERVISOR@example.invalid\",\"role\":\"USUARIO\"}", csrf).body()).contains("CORREO_EN_USO");
        assertThat(admin.json("POST", "/api/accounts", "{\"name\":\"A\",\"email\":\"" + email + "\",\"role\":\"USUARIO\"}", null).statusCode()).isEqualTo(403);
        assertThat(count("SELECT count(*) FROM sti.app_user WHERE email = ?", email)).isZero();
    }

    // ---------------------------------------------------------------------------------------------- CA-19

    @Test void phoneIsOptionalValidatedAndEditable() throws Exception {
        var admin = admin();
        String csrf = admin.csrf();
        var none = create(admin, "Sin telefono", "USUARIO", null, null);
        assertThat(phone(none.id())).isNull();
        var blank = create(admin, "Telefono en blanco", "USUARIO", null, "   ");
        assertThat(phone(blank.id())).isNull();
        for (String wrong : new String[]{"0981-ABC", "1".repeat(31), "0981;123"}) {
            var refused = admin.json("POST", "/api/accounts", "{\"name\":\"Mal\",\"email\":\"tel-" + UUID.randomUUID()
                + "@example.invalid\",\"role\":\"USUARIO\",\"phone\":\"" + wrong + "\"}", csrf);
            assertThat(refused.statusCode()).as(wrong).isEqualTo(400);
            assertThat(refused.body()).contains("TELEFONO");
            assertThat(admin.json("PUT", "/api/accounts/" + none.id(), "{\"phone\":\"" + wrong + "\"}", csrf).statusCode()).as(wrong).isEqualTo(400);
        }
        String thirty = "+595 (981) 123-456 789 012 345".substring(0, 30);
        assertThat(admin.json("PUT", "/api/accounts/" + none.id(), "{\"phone\":\"" + thirty + "\"}", csrf).statusCode()).isEqualTo(200);
        assertThat(phone(none.id())).isEqualTo(thirty);
        assertThat(admin.get("/api/accounts").body()).contains(thirty);
        assertThat(admin.json("PUT", "/api/accounts/" + none.id(), "{\"phone\":\"\"}", csrf).statusCode()).isEqualTo(200);
        assertThat(phone(none.id())).isNull();
    }

    // ---------------------------------------------------------------------------------------------- CA-14

    @Test void anInitialPasswordOnlyLetsThePersonChangeItOrLeave() throws Exception {
        var admin = admin();
        var person = create(admin, "Primer ingreso", "SUPERVISOR", null, null);
        var browser = new Browser();
        assertThat(browser.login(person.email(), person.password())).isEqualTo(204);
        String csrf = browser.csrf();
        assertThat(browser.get("/api/auth/me").body()).contains("\"mustChangePassword\":true");
        for (String path : new String[]{"/api/projects", "/api/tasks", "/api/clients", "/api/operators", "/api/accounts"}) {
            var refused = browser.get(path);
            assertThat(refused.statusCode()).as(path).isEqualTo(403);
            assertThat(refused.body()).as(path).contains("CAMBIO_DE_CONTRASENA");
        }
        String task = "{\"projectId\":\"" + PROJECT_A + "\",\"title\":\"No debe crearse\",\"location\":" + HERE + "}";
        assertThat(browser.json("POST", "/api/tasks", task, csrf).body()).contains("CAMBIO_DE_CONTRASENA");
        assertThat(count("SELECT count(*) FROM sti.task WHERE title = 'No debe crearse'")).isZero();
        // The rules of a new password apply on the first sign-in too; the initial one is not asked again.
        assertThat(browser.json("POST", "/api/auth/password", "{\"newPassword\":\"corta\"}", csrf).body()).contains("CONTRASENA_CORTA");
        assertThat(browser.json("POST", "/api/auth/password", "{\"newPassword\":\"" + person.password() + "\"}", csrf).body()).contains("CONTRASENA_IGUAL");
        // Logout is allowed with an initial password in force.
        var other = new Browser();
        assertThat(other.login(person.email(), person.password())).isEqualTo(204);
        assertThat(other.json("POST", "/api/auth/logout", "", other.csrf()).statusCode()).isEqualTo(204);

        String chosen = "Elegida-" + UUID.randomUUID();
        assertThat(browser.json("POST", "/api/auth/password", "{\"newPassword\":\"" + chosen + "\"}", csrf).statusCode()).isEqualTo(204);
        assertThat(browser.get("/api/projects").statusCode()).isEqualTo(200);
        assertThat(browser.get("/api/auth/me").body()).contains("\"mustChangePassword\":false");
        assertThat(owner.queryForObject("SELECT must_change_password FROM sti.app_user WHERE id = ?", Boolean.class, person.id())).isFalse();
        assertThat(new Browser().login(person.email(), person.password())).as("initial password after the change").isEqualTo(401);
        assertThat(new Browser().login(person.email(), chosen)).isEqualTo(204);
        assertThat(placesHolding(chosen)).isEmpty();
    }

    // ---------------------------------------------------------------------------------------------- CA-15

    @Test void changingTheOwnPasswordAsksForTheCurrentOneAndEndsTheOtherSessions() throws Exception {
        var person = ready(create(admin(), "Mi contrasena", "USUARIO", null, null));
        var here = new Browser(); assertThat(here.login(person.email(), person.password())).isEqualTo(204);
        var elsewhere = new Browser(); assertThat(elsewhere.login(person.email(), person.password())).isEqualTo(204);
        assertThat(sessions(person.email())).isEqualTo(2);
        String csrf = here.csrf();
        String next = "Nueva-" + UUID.randomUUID();
        assertThat(here.json("POST", "/api/auth/password", "{\"newPassword\":\"" + next + "\"}", csrf).body()).contains("CONTRASENA_ACTUAL");
        assertThat(here.json("POST", "/api/auth/password", "{\"currentPassword\":\"equivocada-123\",\"newPassword\":\"" + next + "\"}", csrf).body()).contains("CONTRASENA_ACTUAL");
        assertThat(here.json("POST", "/api/auth/password", "{\"currentPassword\":\"" + person.password() + "\",\"newPassword\":\"once-chars!\"}", csrf).body()).contains("CONTRASENA_CORTA");
        assertThat(here.json("POST", "/api/auth/password", "{\"currentPassword\":\"" + person.password() + "\",\"newPassword\":\"" + person.password() + "\"}", csrf).body()).contains("CONTRASENA_IGUAL");
        assertThat(sessions(person.email())).as("refused changes end nothing").isEqualTo(2);
        assertThat(here.json("POST", "/api/auth/password", "{\"currentPassword\":\"" + person.password() + "\",\"newPassword\":\"" + next + "\"}", csrf).statusCode()).isEqualTo(204);
        assertThat(sessions(person.email())).isEqualTo(1);
        assertThat(here.get("/api/auth/me").statusCode()).isEqualTo(200);
        assertThat(elsewhere.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(new Browser().login(person.email(), person.password())).isEqualTo(401);
        assertThat(new Browser().login(person.email(), next)).isEqualTo(204);
        assertThat(count("SELECT count(*) FROM sti.account_event WHERE account_id = ? AND kind = 'CAMBIO_CONTRASENA'", person.id())).isEqualTo(2);
    }

    // ---------------------------------------------------------------------------------------------- CA-16, D-83

    @Test void aResetVoidsTheOldPasswordEndsEverySessionAndAsksForTheChangeAgain() throws Exception {
        var admin = admin();
        var person = ready(create(admin, "Restablecer", "USUARIO", null, null));
        var open = new Browser(); assertThat(open.login(person.email(), person.password())).isEqualTo(204);
        var reset = admin.json("POST", "/api/accounts/" + person.id() + "/password-reset", "", admin.csrf());
        assertThat(reset.statusCode()).isEqualTo(200);
        assertThat(reset.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        String fresh = JsonPath.read(reset.body(), "$.initialPassword");
        assertThat(fresh).isNotEqualTo(person.password());
        assertThat(sessions(person.email())).isZero();
        assertThat(open.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(new Browser().login(person.email(), person.password())).isEqualTo(401);
        var again = new Browser();
        assertThat(again.login(person.email(), fresh)).isEqualTo(204);
        assertThat(again.get("/api/tasks").body()).contains("CAMBIO_DE_CONTRASENA");
        assertThat(placesHolding(fresh)).isEmpty();
        assertThat(count("SELECT count(*) FROM sti.account_event WHERE account_id = ? AND kind = 'RESTABLECIMIENTO' AND actor_id = ?",
            person.id(), id("admin"))).isEqualTo(1);

        var own = admin.json("POST", "/api/accounts/" + id("admin") + "/password-reset", "", admin.csrf());
        assertThat(own.statusCode()).isEqualTo(409);
        assertThat(own.body()).contains("PROPIA_CONTRASENA", "Mi contraseña");
        assertThat(new Browser().login("admin@example.invalid", PASSWORD)).isEqualTo(204);
    }

    // ---------------------------------------------------------------------------------------------- CA-17

    @Test void deactivatingKeepsTasksAndHistoryAndTakesTheAccessAway() throws Exception {
        var admin = admin();
        var person = ready(create(admin, "Desactivar", "USUARIO", null, null));
        var supervisor = new Browser(); supervisor.login("supervisor");
        String task = newTask(supervisor, "Tarea de quien se va");
        assign(supervisor, task, person.id());
        var open = new Browser(); assertThat(open.login(person.email(), person.password())).isEqualTo(204);
        int eventsBefore = count("SELECT count(*) FROM sti.task_event WHERE task_id = ?::uuid", task);

        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"active\":false}", admin.csrf()).statusCode()).isEqualTo(200);
        assertThat(open.get("/api/tasks").statusCode()).as("open session, next request").isEqualTo(401);
        assertThat(sessions(person.email())).isZero();
        assertThat(new Browser().login(person.email(), person.password())).isEqualTo(401);
        assertThat(count("SELECT count(*) FROM sti.app_user WHERE id = ?", person.id())).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?::uuid AND user_id = ?", task, person.id())).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM sti.task_event WHERE task_id = ?::uuid", task)).isEqualTo(eventsBefore);
        assertThat(supervisor.get("/api/tasks/" + task).body()).contains(person.id().toString());
        assertThat(supervisor.get("/api/operators").body()).doesNotContain(person.id().toString());
        String other = newTask(supervisor, "No se le asigna");
        assertThat(supervisor.json("POST", "/api/tasks/" + other + "/assignments", "{\"userId\":\"" + person.id() + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(400);
        assertThat((List<Boolean>) JsonPath.read(admin.get("/api/operators?includeInactive=true").body(),
            "$[?(@.id == '" + person.id() + "')].active")).containsExactly(false);

        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"active\":true}", admin.csrf()).statusCode()).isEqualTo(200);
        assertThat(new Browser().login(person.email(), person.password())).isEqualTo(204);
        assertThat(count("SELECT count(*) FROM sti.account_event WHERE account_id = ? AND kind IN ('DESACTIVACION','ACTIVACION')", person.id())).isEqualTo(2);

        var self = admin.json("PUT", "/api/accounts/" + id("admin"), "{\"active\":false}", admin.csrf());
        assertThat(self.statusCode()).isEqualTo(409);
        assertThat(self.body()).contains("PROPIA_CUENTA");
    }

    /**
     * Two ADMINs, the only active ones, deactivate each other at the same time. The advisory lock lets one in; the
     * other one finds itself the last one, or finds its session ended. There is never zero active ADMINs.
     */
    @Test void twoAdminsRemovingEachOtherAtOnceNeverLeaveNone() throws Exception {
        List<UUID> others = owner.queryForList("SELECT id FROM sti.app_user WHERE role = 'ADMIN' AND enabled AND email NOT IN ('admin@example.invalid','admin2@example.invalid')", UUID.class);
        for (UUID other : others) owner.update("UPDATE sti.app_user SET enabled = false WHERE id = ?", other);
        List<String> failures = new ArrayList<>();
        try {
            for (int round = 1; round <= ROUNDS; round++) {
                var one = new Browser(); one.login("admin");
                var two = new Browser(); two.login("admin2");
                String csrfOne = one.csrf(), csrfTwo = two.csrf();
                var barrier = new CyclicBarrier(2);
                var pool = Executors.newFixedThreadPool(2);
                try {
                    var first = pool.submit(() -> { barrier.await(); return one.json("PUT", "/api/accounts/" + id("admin2"), "{\"active\":false}", csrfOne); });
                    var second = pool.submit(() -> { barrier.await(); return two.json("PUT", "/api/accounts/" + id("admin"), "{\"active\":false}", csrfTwo); });
                    int a = first.get(60, TimeUnit.SECONDS).statusCode(), b = second.get(60, TimeUnit.SECONDS).statusCode();
                    int admins = count("SELECT count(*) FROM sti.app_user WHERE role = 'ADMIN' AND enabled");
                    long ok = java.util.stream.Stream.of(a, b).filter(s -> s == 200).count();
                    if (admins < 1 || ok != 1) failures.add("vuelta " + round + ": respuestas " + a + "/" + b + ", administradores activos " + admins);
                } finally {
                    pool.shutdownNow();
                    owner.update("UPDATE sti.app_user SET enabled = true WHERE email IN ('admin@example.invalid','admin2@example.invalid')");
                }
            }
        } finally {
            for (UUID other : others) owner.update("UPDATE sti.app_user SET enabled = true WHERE id = ?", other);
        }
        System.out.println("CA-17 último administrador: " + failures.size() + " de " + ROUNDS + " vueltas con falla");
        failures.forEach(System.out::println);
        assertThat(failures).isEmpty();
    }

    /**
     * D-82: deactivating the only technician still pending on a task in progress is allowed, with a warning count
     * shown first. A SUPERVISOR then unblocks the task: another person is assigned and the deactivated one removed,
     * or the task goes back to Por hacer.
     */
    @Test void aSupervisorUnblocksATaskWhoseOnlyPendingTechnicianWasDeactivated() throws Exception {
        var admin = admin();
        var supervisor = new Browser(); supervisor.login("supervisor");
        var replacement = ready(create(admin, "Reemplazo", "USUARIO", null, null));
        for (String way : new String[]{"reasignar", "volver"}) {
            var gone = ready(create(admin, "Pendiente " + way, "USUARIO", null, null));
            String task = newTask(supervisor, "En proceso " + way);
            assign(supervisor, task, gone.id());
            assertThat(supervisor.json("POST", "/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
            assertThat((Integer) JsonPath.read(admin.get("/api/accounts/" + gone.id()).body(), "$.pendingInProgress")).isEqualTo(1);
            assertThat(admin.json("PUT", "/api/accounts/" + gone.id(), "{\"active\":false}", admin.csrf()).statusCode()).isEqualTo(200);
            assertThat(status(task)).isEqualTo("EN_PROCESO");
            if (way.equals("reasignar")) {
                assign(supervisor, task, replacement.id());
                var removed = supervisor.json("DELETE", "/api/tasks/" + task + "/assignments/" + gone.id(), "", supervisor.csrf());
                assertThat(removed.statusCode()).isEqualTo(200);
                assertThat(status(task)).isEqualTo("EN_PROCESO");
                var technician = new Browser(); assertThat(technician.login(replacement.email(), replacement.password())).isEqualTo(204);
                assertThat(technician.json("POST", "/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", technician.csrf()).body())
                    .contains("\"status\":\"FINALIZADO\"");
            } else {
                assertThat(supervisor.json("POST", "/api/tasks/" + task + "/status", "{\"to\":\"POR_HACER\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
                assertThat(status(task)).isEqualTo("POR_HACER");
                assertThat(supervisor.json("DELETE", "/api/tasks/" + task + "/assignments/" + gone.id(), "", supervisor.csrf()).statusCode()).isEqualTo(200);
                assertThat(count("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?::uuid", task)).isZero();
            }
        }
    }

    // ---------------------------------------------------------------------------------------------- CA-18

    @Test void editingFollowsEveryRuleOfRoleCompanyAndEmail() throws Exception {
        var admin = admin();
        String csrf = admin.csrf();
        UUID me = id("admin");
        var ownRole = admin.json("PUT", "/api/accounts/" + me, "{\"role\":\"SUPERVISOR\"}", csrf);
        assertThat(ownRole.statusCode()).isEqualTo(409);
        assertThat(ownRole.body()).contains("PROPIO_ROL");
        assertThat(admin.json("PUT", "/api/accounts/" + me, "{\"name\":\"Existing admin\",\"role\":\"ADMIN\"}", csrf).statusCode()).isEqualTo(200);

        // Another ADMIN can be demoted while one stays active, and promoted back.
        assertThat(admin.json("PUT", "/api/accounts/" + id("admin2"), "{\"role\":\"SUPERVISOR\"}", csrf).statusCode()).isEqualTo(200);
        assertThat(admin.json("PUT", "/api/accounts/" + id("admin2"), "{\"role\":\"ADMIN\"}", csrf).statusCode()).isEqualTo(200);

        var person = ready(create(admin, "Editar", "USUARIO", null, "021 555"));
        var open = new Browser(); assertThat(open.login(person.email(), person.password())).isEqualTo(204);
        var taken = admin.json("PUT", "/api/accounts/" + person.id(), "{\"email\":\"supervisor@example.invalid\"}", csrf);
        assertThat(taken.statusCode()).isEqualTo(409);
        assertThat(taken.body()).contains("CORREO_EN_USO");
        assertThat(open.get("/api/auth/me").statusCode()).as("a refused edit ends nothing").isEqualTo(200);
        String moved = "editado-" + UUID.randomUUID() + "@example.invalid";
        var edited = admin.json("PUT", "/api/accounts/" + person.id(), "{\"name\":\"Editado\",\"email\":\"" + moved.toUpperCase() + "\",\"phone\":\"0981 000 111\"}", csrf);
        assertThat(edited.statusCode()).isEqualTo(200);
        assertThat(edited.body()).contains(moved, "Editado", "0981 000 111");
        assertThat(open.get("/api/auth/me").statusCode()).as("email change ends the sessions").isEqualTo(401);
        assertThat(new Browser().login(person.email(), person.password())).isEqualTo(401);
        assertThat(new Browser().login(moved, person.password())).isEqualTo(204);

        // To CLIENTE: needs a company, and no open task assigned.
        var supervisor = new Browser(); supervisor.login("supervisor");
        String task = newTask(supervisor, "Abierta de quien pasa a cliente");
        assign(supervisor, task, person.id());
        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"role\":\"CLIENTE\"}", csrf).body()).contains("EMPRESA");
        var busy = admin.json("PUT", "/api/accounts/" + person.id(), "{\"role\":\"CLIENTE\",\"clientId\":\"" + COMPANY_A + "\"}", csrf);
        assertThat(busy.statusCode()).isEqualTo(409);
        assertThat(busy.body()).contains("TAREAS_ABIERTAS", "reasigná");
        assertThat(owner.queryForObject("SELECT role FROM sti.app_user WHERE id = ?", String.class, person.id())).isEqualTo("USUARIO");
        assertThat(supervisor.json("DELETE", "/api/tasks/" + task + "/assignments/" + person.id(), "", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"role\":\"CLIENTE\",\"clientId\":\"" + COMPANY_A + "\"}", csrf).statusCode()).isEqualTo(200);
        assertThat(owner.queryForObject("SELECT client_id FROM sti.app_user WHERE id = ?", UUID.class, person.id())).isEqualTo(COMPANY_A);
        var customer = new Browser(); assertThat(customer.login(moved, person.password())).isEqualTo(204);
        assertThat(customer.get("/api/clients").body()).contains("Upgrade A").doesNotContain("Upgrade B");
        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"role\":\"USUARIO\",\"clientId\":\"" + COMPANY_A + "\"}", csrf).body()).contains("EMPRESA");
        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"role\":\"USUARIO\"}", csrf).statusCode()).isEqualTo(200);
        assertThat(owner.queryForObject("SELECT client_id FROM sti.app_user WHERE id = ?", UUID.class, person.id())).isNull();
        assertThat(admin.json("PUT", "/api/accounts/" + UUID.randomUUID(), "{\"name\":\"Nadie\"}", csrf).statusCode()).isEqualTo(404);
    }

    /**
     * D-88: a finished task is not open, so its assignee may become a customer. If the task is then reopened, the
     * SUPERVISOR assigns another person, removes the customer and the task runs its course. Meanwhile that customer,
     * of another company, neither sees nor touches the task: 404 on every task operation.
     */
    @Test void aReopenedTaskWhoseAssigneeBecameACustomerOfAnotherCompanyGoesOnWithoutThem() throws Exception {
        var admin = admin();
        var supervisor = new Browser(); supervisor.login("supervisor");
        var person = ready(create(admin, "Pasa a cliente", "USUARIO", null, null));
        var replacement = ready(create(admin, "Sigue la tarea", "USUARIO", null, null));
        String task = newTask(supervisor, "Finalizada de quien pasa a cliente");
        assign(supervisor, task, person.id());
        assertThat(supervisor.json("POST", "/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
        var technician = new Browser(); assertThat(technician.login(person.email(), person.password())).isEqualTo(204);
        assertThat(technician.json("POST", "/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", technician.csrf()).body()).contains("\"status\":\"FINALIZADO\"");

        // FINALIZADO is not open (D-88): the change to CLIENTE of the other company goes through.
        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"role\":\"CLIENTE\",\"clientId\":\"" + COMPANY_B + "\"}", admin.csrf()).statusCode()).isEqualTo(200);
        assertThat(supervisor.json("POST", "/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(count("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?::uuid AND user_id = ?", task, person.id())).isEqualTo(1);

        // Still listed as assignee, the customer of company B cannot see or touch a task of company A.
        var customer = new Browser(); assertThat(customer.login(person.email(), person.password())).isEqualTo(204);
        String csrf = customer.csrf();
        assertThat(customer.get("/api/tasks").body()).doesNotContain(task);
        assertThat(customer.get("/api/tasks/" + task).statusCode()).isEqualTo(404);
        assertThat(customer.get("/api/tasks/" + task + "/signature").statusCode()).isEqualTo(404);
        assertThat(customer.json("POST", "/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", csrf).statusCode()).isEqualTo(404);
        assertThat(customer.json("POST", "/api/tasks/" + task + "/status", "{\"to\":\"POR_HACER\",\"location\":" + HERE + "}", csrf).statusCode()).isEqualTo(404);
        assertThat(customer.json("POST", "/api/tasks/" + task + "/assignments", "{\"userId\":\"" + person.id() + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", csrf).statusCode()).isEqualTo(404);
        assertThat(customer.json("DELETE", "/api/tasks/" + task + "/assignments/" + person.id(), "", csrf).statusCode()).isEqualTo(404);
        assertThat(customer.json("POST", "/api/tasks/" + task + "/signature", "{\"signerName\":\"X\",\"signedOn\":\"2026-11-19\",\"image\":\"x\",\"location\":" + HERE + "}", csrf).statusCode()).isEqualTo(404);
        assertThat(status(task)).isEqualTo("EN_PROCESO");
        assertThat(count("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?::uuid AND user_id = ? AND confirmed_at IS NULL", task, person.id())).isEqualTo(1);

        // The SUPERVISOR assigns another person, removes the customer, and the task runs its course.
        assign(supervisor, task, replacement.id());
        assertThat(supervisor.json("DELETE", "/api/tasks/" + task + "/assignments/" + person.id(), "", supervisor.csrf()).statusCode()).isEqualTo(200);
        assertThat(status(task)).isEqualTo("EN_PROCESO");
        var next = new Browser(); assertThat(next.login(replacement.email(), replacement.password())).isEqualTo(204);
        assertThat(next.json("POST", "/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", next.csrf()).body()).contains("\"status\":\"FINALIZADO\"");
        assertThat(count("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?::uuid", task)).isEqualTo(1);
    }

    // ---------------------------------------------------------------------------------------------- CA-20 (D-84)

    @Test void assignedTasksCountWhatTheBoardShowsForThatPerson() throws Exception {
        var admin = admin();
        var person = ready(create(admin, "Contador", "USUARIO", null, null));
        var supervisor = new Browser(); supervisor.login("supervisor");
        for (String title : new String[]{"Una", "Dos", "Anulada"}) assign(supervisor, newTask(supervisor, "Contar " + title), person.id());
        String cancelled = owner.queryForObject("SELECT id::text FROM sti.task WHERE title = 'Contar Anulada'", String.class);
        assertThat(admin.json("POST", "/api/tasks/" + cancelled + "/status", "{\"to\":\"ANULADA\",\"location\":" + HERE + "}", admin.csrf()).statusCode()).isEqualTo(200);
        int counted = JsonPath.read(admin.get("/api/accounts/" + person.id()).body(), "$.assignedTasks");
        List<Map<String, Object>> board = JsonPath.read(admin.get("/api/tasks").body(), "$");
        long onBoard = board.stream().filter(task -> ((List<Map<String, Object>>) task.get("assignees")).stream()
            .anyMatch(assignee -> person.id().toString().equals(assignee.get("id")))).count();
        assertThat(counted).isEqualTo(2).isEqualTo((int) onBoard);
    }

    // ---------------------------------------------------------------------------------------------- CA-22

    @Test void theAccountLogNamesWhoWhatAndWhenAndHoldsNoPassword() throws Exception {
        var admin = admin();
        String csrf = admin.csrf();
        var person = create(admin, "Bitacora", "USUARIO", null, null);
        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"name\":\"Bitacora editada\",\"phone\":\"021 1\"}", csrf).statusCode()).isEqualTo(200);
        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"active\":false}", csrf).statusCode()).isEqualTo(200);
        assertThat(admin.json("PUT", "/api/accounts/" + person.id(), "{\"active\":true}", csrf).statusCode()).isEqualTo(200);
        String reset = JsonPath.read(admin.json("POST", "/api/accounts/" + person.id() + "/password-reset", "", csrf).body(), "$.initialPassword");
        var browser = new Browser(); assertThat(browser.login(person.email(), reset)).isEqualTo(204);
        String chosen = "Bitacora-" + UUID.randomUUID();
        assertThat(browser.json("POST", "/api/auth/password", "{\"newPassword\":\"" + chosen + "\"}", browser.csrf()).statusCode()).isEqualTo(204);

        var events = owner.queryForList("SELECT kind, actor_id, changes::text AS changes, occurred_at FROM sti.account_event WHERE account_id = ? ORDER BY occurred_at", person.id());
        assertThat(events).extracting(e -> e.get("kind")).containsExactly(
            "ALTA", "EDICION", "DESACTIVACION", "ACTIVACION", "RESTABLECIMIENTO", "CAMBIO_CONTRASENA");
        assertThat(events.subList(0, 5)).allSatisfy(e -> assertThat(e.get("actor_id")).isEqualTo(id("admin")));
        assertThat(events.get(5).get("actor_id")).isEqualTo(person.id());
        assertThat(events).allSatisfy(e -> assertThat(e.get("occurred_at")).isNotNull());
        assertThat((String) events.get(0).get("changes")).contains(person.email(), "USUARIO");
        assertThat((String) events.get(1).get("changes")).contains("\"antes\": \"Bitacora\"", "\"despues\": \"Bitacora editada\"", "021 1");
        for (String secret : new String[]{person.password(), reset, chosen}) {
            assertThat(owner.queryForList("SELECT changes::text FROM sti.account_event", String.class)).noneMatch(c -> c.contains(secret));
            assertThat(placesHolding(secret)).isEmpty();
        }
        assertThat(owner.queryForList("SELECT changes::text FROM sti.account_event", String.class))
            .noneMatch(c -> c.toLowerCase().contains("password") || c.contains("$2a$"));
    }

    // ---------------------------------------------------------------------------------------------- helpers

    record Person(UUID id, String email, String password) {}

    private Browser admin() throws Exception { var admin = new Browser(); admin.login("admin"); return admin; }

    private Person create(Browser admin, String name, String role, UUID clientId, String phone) throws Exception {
        String email = "p-" + UUID.randomUUID() + "@example.invalid";
        String body = "{\"name\":\"" + name + "\",\"email\":\"" + email + "\",\"role\":\"" + role + "\""
            + (clientId == null ? "" : ",\"clientId\":\"" + clientId + "\"")
            + (phone == null ? "" : ",\"phone\":\"" + phone + "\"") + "}";
        var created = admin.json("POST", "/api/accounts", body, admin.csrf());
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        return new Person(UUID.fromString(JsonPath.read(created.body(), "$.account.id")), email,
            JsonPath.read(created.body(), "$.initialPassword"));
    }

    /** The person signs in once and chooses a password, as on the first sign-in screen. */
    private Person ready(Person person) throws Exception {
        var browser = new Browser();
        assertThat(browser.login(person.email(), person.password())).isEqualTo(204);
        String chosen = "Propia-" + UUID.randomUUID();
        assertThat(browser.json("POST", "/api/auth/password", "{\"newPassword\":\"" + chosen + "\"}", browser.csrf()).statusCode()).isEqualTo(204);
        assertThat(browser.json("POST", "/api/auth/logout", "", browser.csrf()).statusCode()).isEqualTo(204);
        return new Person(person.id(), person.email(), chosen);
    }

    private String newTask(Browser supervisor, String title) throws Exception {
        var created = supervisor.json("POST", "/api/tasks", "{\"projectId\":\"" + PROJECT_A + "\",\"title\":\"" + title + "\",\"location\":" + HERE + "}", supervisor.csrf());
        assertThat(created.statusCode()).isEqualTo(201);
        return JsonPath.read(created.body(), "$.id");
    }

    private void assign(Browser supervisor, String task, UUID person) throws Exception {
        assertThat(supervisor.json("POST", "/api/tasks/" + task + "/assignments", "{\"userId\":\"" + person + "\",\"scheduledOn\":\"" + java.time.LocalDate.now(java.time.ZoneId.of("America/Asuncion")) + "\"}", supervisor.csrf()).statusCode()).isEqualTo(200);
    }

    /**
     * Every row of every table in the schema, read as text, that holds the secret in clear or as bytes (Spring
     * Session keeps its attributes as bytes, which a row shows in hex). Empty means nowhere.
     */
    private static List<String> placesHolding(String secret) {
        String hex = HexFormat.of().formatHex(secret.getBytes(StandardCharsets.UTF_8));
        List<String> places = new ArrayList<>();
        for (String table : owner.queryForList("SELECT table_name FROM information_schema.tables WHERE table_schema = 'sti' AND table_type = 'BASE TABLE'", String.class)) {
            int rows = count("SELECT count(*) FROM sti.\"" + table + "\" x WHERE strpos(x::text, ?) > 0 OR strpos(lower(x::text), ?) > 0", secret, hex);
            if (rows > 0) places.add(table + ": " + rows);
        }
        return places;
    }

    private static int sessions(String email) { return count("SELECT count(*) FROM sti.spring_session WHERE principal_name = ?", email); }
    private static String phone(UUID id) { return owner.queryForObject("SELECT phone FROM sti.app_user WHERE id = ?", String.class, id); }
    private static String status(String task) { return owner.queryForObject("SELECT status FROM sti.task WHERE id = ?::uuid", String.class, task); }
    private static UUID id(String name) {
        return owner.queryForObject("SELECT id FROM sti.app_user WHERE email = ?", UUID.class, name + "@example.invalid");
    }
    private static String[] emails(String[] names) {
        return java.util.Arrays.stream(names).map(n -> n + "@example.invalid").toArray(String[]::new);
    }
    private static int count(String sql, Object... parameters) {
        Integer value = owner.queryForObject(sql, Integer.class, parameters);
        return value == null ? 0 : value;
    }
    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalStateException("Use scripts/ensayo.ps1 -Accion Suite; missing " + key);
        return value;
    }

    class Browser {
        final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
        HttpResponse<String> get(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
        }
        String csrf() throws Exception { return JsonPath.read(get("/api/auth/csrf").body(), "$.token"); }
        HttpResponse<String> json(String method, String path, String body, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
            if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
            return client.send(request.method(method, HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        }
        int login(String email, String password) throws Exception {
            String form = "username=" + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8);
            var request = HttpRequest.newBuilder(uri("/api/auth/login")).header("Content-Type", "application/x-www-form-urlencoded")
                .header("X-CSRF-TOKEN", csrf()).POST(HttpRequest.BodyPublishers.ofString(form)).build();
            return client.send(request, HttpResponse.BodyHandlers.ofString()).statusCode();
        }
        void login(String name) throws Exception { assertThat(login(name + "@example.invalid", PASSWORD)).as("login " + name).isEqualTo(204); }
    }
}
