package com.stisistemas.os;

import static org.assertj.core.api.Assertions.*;

import com.jayway.jsonpath.JsonPath;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.ZoneId;
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
 * Corte 3B (CA-72, CA-73): the day a task is assigned for (R-10, R-10b, D-251, D-252, D-259, D-263, D-264), the dates
 * each task shows (R-25, R-02) and renaming clients and projects with unique names (R-05, D-258, D-265). Four roles
 * and no session; every check reads the database, not only the answer; the races run on separate sessions released
 * together by a barrier, several rounds.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.servlet.session.cookie.secure=false")
class ScheduleAndNamesTest {
    static final String PASSWORD = UUID.randomUUID().toString();
    static final String TAG = UUID.randomUUID().toString().substring(0, 8);
    static final UUID COMPANY = UUID.randomUUID();
    static final UUID OTHER_COMPANY = UUID.randomUUID();
    static final UUID PROJECT = UUID.randomUUID();
    static final String HERE = "{\"latitude\":-25.3,\"longitude\":-57.6,\"accuracyM\":12.5}";
    static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Asuncion"));
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
        owner.update("INSERT INTO sti.client VALUES (?, ?), (?, ?)", COMPANY, "Fechas " + TAG, OTHER_COMPANY, "Otra fechas " + TAG);
        owner.update("INSERT INTO sti.project VALUES (?, ?, ?)", PROJECT, COMPANY, "Proyecto fechas " + TAG);
        String hash = new BCryptPasswordEncoder(12).encode(PASSWORD);
        for (String name : new String[]{"admin", "admin2", "supervisor", "supervisor2", "tecnico", "tecnico2", "inactivo", "cliente", "otro"}) {
            String role = switch (name) {
                case "admin", "admin2" -> "ADMIN";
                case "supervisor", "supervisor2" -> "SUPERVISOR";
                case "tecnico", "tecnico2", "inactivo" -> "USUARIO";
                default -> "CLIENTE";
            };
            UUID company = name.equals("cliente") ? COMPANY : name.equals("otro") ? OTHER_COMPANY : null;
            owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,client_id,enabled) VALUES (?,?,?,?,?,?,?)",
                UUID.randomUUID(), email(name), "Fechas " + name, hash, role, company, !name.equals("inactivo"));
        }
        registry.add("sti.uploads.dir", () -> FoundationTest.UPLOADS);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> required("STI_DB_USER"));
        registry.add("spring.datasource.password", () -> required("STI_DB_PASSWORD"));
    }

    @LocalServerPort int port;

    // ------------------------------------------------------------------------------------------- A: at creation

    @Test void operatorsAssignPeopleAndTheDayAtCreationAndTheDayIsRequiredWithPeople() throws Exception {
        var supervisor = browser("supervisor");
        LocalDate day = TODAY.plusDays(3);
        var created = supervisor.postJson("/api/tasks", newTask("Con equipo " + TAG,
            ",\"assignees\":[\"" + userId("tecnico") + "\",\"" + userId("tecnico2") + "\"],\"scheduledOn\":\"" + day + "\""), supervisor.csrf());
        assertThat(created.statusCode()).isEqualTo(201);
        UUID task = UUID.fromString(JsonPath.read(created.body(), "$.id"));
        assertThat(created.body()).contains("\"scheduledOn\":\"" + day + "\"", "\"rescheduled\":0");
        assertThat(scheduled(task)).isEqualTo(day);
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?", Integer.class, task)).isEqualTo(2);
        assertThat(owner.queryForList("SELECT u.email || ' ' || e.scheduled_to FROM sti.task_event e JOIN sti.app_user u ON u.id = e.subject_id "
            + "WHERE e.task_id = ? AND e.kind = 'ASIGNADA' ORDER BY 1", String.class, task))
            // DEV-09: any order; ORDER BY 1 follows the database collation, which skips the dot in the e-mail.
            .containsExactlyInAnyOrder(email("tecnico") + " " + day, email("tecnico2") + " " + day);

        // With people and no day, nothing is created.
        var admin = browser("admin");
        String title = "Sin día " + UUID.randomUUID();
        var refused = admin.postJson("/api/tasks", newTask(title, ",\"assignees\":[\"" + userId("tecnico") + "\"]"), admin.csrf());
        assertThat(code(refused)).isEqualTo("400 FECHA_OBLIGATORIA");
        assertThat(JsonPath.<String>read(refused.body(), "$.message")).contains("fecha de asignación es obligatoria");
        assertThat(tasksTitled(title)).isZero();
        // A day without people is allowed; people that cannot be assigned are refused.
        var dayOnly = admin.postJson("/api/tasks", newTask("Solo día " + TAG, ",\"scheduledOn\":\"" + TODAY + "\""), admin.csrf());
        assertThat(dayOnly.statusCode()).isEqualTo(201);
        assertThat(scheduled(UUID.fromString(JsonPath.read(dayOnly.body(), "$.id")))).isEqualTo(TODAY);
        for (String nobody : new String[]{"inactivo", "cliente"}) {
            String t = "No asignable " + UUID.randomUUID();
            assertThat(admin.postJson("/api/tasks", newTask(t, ",\"assignees\":[\"" + userId(nobody) + "\"],\"scheduledOn\":\"" + TODAY + "\""),
                admin.csrf()).statusCode()).as(nobody).isEqualTo(400);
            assertThat(tasksTitled(t)).isZero();
        }
        // Without people the task still starts without a day.
        var plain = admin.postJson("/api/tasks", newTask("Sin nada " + TAG, ""), admin.csrf());
        assertThat(scheduled(UUID.fromString(JsonPath.read(plain.body(), "$.id")))).isNull();
    }

    @Test void theCustomerAndTheTechnicianCannotSendPeopleOrADayAndTheTechniciansTaskIsForTodayInParaguay() throws Exception {
        for (String role : new String[]{"cliente", "tecnico"}) {
            var who = browser(role);
            for (String extra : new String[]{",\"assignees\":[\"" + userId("tecnico2") + "\"]", ",\"scheduledOn\":\"" + TODAY + "\"",
                                             ",\"assignees\":[]"}) {
                String title = "Rechazo " + UUID.randomUUID();
                var refused = who.postJson("/api/tasks", newTask(title, extra), who.csrf());
                assertThat(code(refused)).as(role + extra).isEqualTo("403 ASIGNACION_NO_PERMITIDA");
                assertThat(tasksTitled(title)).isZero();
            }
        }
        var technician = browser("tecnico");
        var own = technician.postJson("/api/tasks", newTask("Propia " + TAG, ""), technician.csrf());
        assertThat(own.statusCode()).isEqualTo(201);
        UUID task = UUID.fromString(JsonPath.read(own.body(), "$.id"));
        assertThat(scheduled(task)).isEqualTo(TODAY);
        assertThat(owner.queryForObject("SELECT e.scheduled_to FROM sti.task_event e WHERE e.task_id = ? AND e.kind = 'ASIGNADA'", LocalDate.class, task))
            .isEqualTo(TODAY);
        var customer = browser("cliente");
        var theirs = customer.postJson("/api/tasks", newTask("Del cliente " + TAG, ""), customer.csrf());
        assertThat(theirs.statusCode()).isEqualTo(201);
        assertThat(scheduled(UUID.fromString(JsonPath.read(theirs.body(), "$.id")))).isNull();
        assertThat(new Browser().postJson("/api/tasks", newTask("Sin sesión", ""), null).statusCode()).isIn(401, 403);
    }

    @Test void theDayIsWithinFiveYearsBackAndAhead() throws Exception {
        var admin = browser("admin");
        assertThat(admin.postJson("/api/tasks", newTask("Límite atrás " + TAG, ",\"scheduledOn\":\"" + TODAY.minusYears(5) + "\""), admin.csrf()).statusCode())
            .isEqualTo(201);
        assertThat(admin.postJson("/api/tasks", newTask("Límite adelante " + TAG, ",\"scheduledOn\":\"" + TODAY.plusYears(5) + "\""), admin.csrf()).statusCode())
            .isEqualTo(201);
        for (LocalDate out : new LocalDate[]{TODAY.minusYears(5).minusDays(1), TODAY.plusYears(5).plusDays(1)}) {
            String title = "Fuera " + UUID.randomUUID();
            assertThat(code(admin.postJson("/api/tasks", newTask(title, ",\"scheduledOn\":\"" + out + "\""), admin.csrf()))).isEqualTo("400 FECHA_FUERA_DE_RANGO");
            assertThat(tasksTitled(title)).isZero();
        }
        String task = plainTask();
        assertThat(code(schedule(admin, task, TODAY.plusYears(6)))).isEqualTo("400 FECHA_FUERA_DE_RANGO");
        assertThat(code(assign(admin, task, "tecnico", TODAY.minusYears(6)))).isEqualTo("400 FECHA_FUERA_DE_RANGO");
        assertThat(scheduled(UUID.fromString(task))).isNull();
        assertThat(admin.postJson("/api/tasks/" + task + "/schedule", "{\"scheduledOn\":\"24/11/2026\"}", admin.csrf()).statusCode()).isEqualTo(400);
    }

    // ----------------------------------------------------------------------------------------- A: assigning

    @Test void assigningATaskWithoutADayNeedsTheDayAndATaskWithADayKeepsIt() throws Exception {
        var supervisor = browser("supervisor");
        String task = plainTask();
        UUID id = UUID.fromString(task);
        var refused = assign(supervisor, task, "tecnico", null);
        assertThat(code(refused)).isEqualTo("400 FECHA_OBLIGATORIA");
        assertThat(JsonPath.<String>read(refused.body(), "$.message")).isEqualTo("Esta tarea todavía no tiene fecha de asignación. Elegí el día para poder asignarla.");
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?", Integer.class, id)).isZero();

        LocalDate day = TODAY.plusDays(1);
        assertThat(assign(supervisor, task, "tecnico", day).statusCode()).isEqualTo(200);
        assertThat(scheduled(id)).isEqualTo(day);
        // The day is already there: assigning another person needs no day, the same day is accepted, another is not.
        assertThat(assign(supervisor, task, "tecnico2", null).statusCode()).isEqualTo(200);
        assertThat(code(assign(supervisor, task, "admin", day.plusDays(1)))).isEqualTo("409 FECHA_DISTINTA");
        assertThat(assign(supervisor, task, "admin", day).statusCode()).isEqualTo(200);
        assertThat(scheduled(id)).isEqualTo(day);
        assertThat(owner.queryForList("SELECT e.scheduled_to FROM sti.task_event e WHERE e.task_id = ? AND e.kind = 'ASIGNADA'", LocalDate.class, id))
            .containsOnly(day).hasSize(3);
        // Only operators assign: an assigned technician gets 403, the customer 403, another company 404, no session 401.
        assertThat(assign(browser("tecnico"), task, "tecnico2", day).statusCode()).isEqualTo(403);
        assertThat(assign(browser("cliente"), task, "tecnico2", day).statusCode()).isEqualTo(403);
        assertThat(assign(browser("otro"), task, "tecnico2", day).statusCode()).isEqualTo(404);
        assertThat(new Browser().postJson("/api/tasks/" + task + "/assignments", "{\"userId\":\"" + userId("tecnico2") + "\"}", null).statusCode()).isIn(401, 403);

        // Removing everyone keeps the day (point 8 of the order, D-26).
        for (String person : new String[]{"tecnico", "tecnico2", "admin"}) {
            assertThat(supervisor.send("DELETE", "/api/tasks/" + task + "/assignments/" + userId(person), "{}", supervisor.csrf()).statusCode()).isEqualTo(200);
        }
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task_assignment WHERE task_id = ?", Integer.class, id)).isZero();
        assertThat(scheduled(id)).isEqualTo(day);
    }

    // ---------------------------------------------------------------------------------- A: changing the day

    @Test void operatorsChangeTheDayOnlyWhileOpenAndTheLogKeepsBeforeAfterWhoAndWhen() throws Exception {
        var supervisor = browser("supervisor");
        var admin = browser("admin");
        String task = plainTask();
        UUID id = UUID.fromString(task);
        // "Poner fecha" on a task without a day is not a rescheduling.
        var first = schedule(supervisor, task, TODAY.plusDays(2));
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(first.body()).contains("\"rescheduled\":0");
        var second = schedule(admin, task, TODAY.plusDays(4));
        assertThat(second.body()).contains("\"scheduledOn\":\"" + TODAY.plusDays(4) + "\"", "\"rescheduled\":1");
        // The same day again changes nothing and logs nothing.
        assertThat(schedule(admin, task, TODAY.plusDays(4)).statusCode()).isEqualTo(200);
        assertThat(owner.queryForList("""
            SELECT coalesce(e.scheduled_from::text, '-') || ' ' || e.scheduled_to || ' ' || u.email || ' ' || e.location_absent_reason
                   || ' ' || (e.latitude IS NULL) || ' ' || (e.occurred_at > now() - interval '5 minutes')
            FROM sti.task_event e JOIN sti.app_user u ON u.id = e.actor_id WHERE e.task_id = ? AND e.kind = 'FECHA'
            ORDER BY e.occurred_at""", String.class, id)).containsExactly(
            "- " + TODAY.plusDays(2) + " " + email("supervisor") + " No aplica: cambio de fecha true true",
            TODAY.plusDays(2) + " " + TODAY.plusDays(4) + " " + email("admin") + " No aplica: cambio de fecha true true");
        assertThat(scheduled(id)).isEqualTo(TODAY.plusDays(4));
        // The panel reads it from the detail: the events carry both days, assignments carry the person's name.
        assertThat(assign(supervisor, task, "tecnico", null).statusCode()).isEqualTo(200);
        String detail = admin.get("/api/tasks/" + task).body();
        assertThat(detail).contains("\"kind\":\"FECHA\"", "\"scheduledFrom\":\"" + TODAY.plusDays(2) + "\"", "\"subjectName\":\"Fechas tecnico\"");

        // Nobody else changes it: the assigned technician and the customer 403, another company 404, no session 401.
        assertThat(schedule(browser("tecnico"), task, TODAY).statusCode()).isEqualTo(403);
        assertThat(schedule(browser("cliente"), task, TODAY).statusCode()).isEqualTo(403);
        assertThat(schedule(browser("otro"), task, TODAY).statusCode()).isEqualTo(404);
        assertThat(new Browser().postJson("/api/tasks/" + task + "/schedule", "{\"scheduledOn\":\"" + TODAY + "\"}", null).statusCode()).isIn(401, 403);
        assertThat(scheduled(id)).isEqualTo(TODAY.plusDays(4));

        // In process it still changes; once finished it does not (D-259).
        var technician = browser("tecnico");
        assertThat(technician.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", technician.csrf()).statusCode()).isEqualTo(200);
        assertThat(schedule(supervisor, task, TODAY.plusDays(5)).statusCode()).isEqualTo(200);
        assertThat(technician.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", technician.csrf()).body()).contains("\"status\":\"FINALIZADO\"");
        assertThat(code(schedule(supervisor, task, TODAY.plusDays(6)))).isEqualTo("409 FECHA_NO_EDITABLE");
        assertThat(scheduled(id)).isEqualTo(TODAY.plusDays(5));
    }

    // -------------------------------------------------------------------------------------- B: the dates

    @Test void terminadaFollowsTheServiceRecordAndIsEmptyWhileReopened() throws Exception {
        var supervisor = browser("supervisor");
        var technician = browser("tecnico");
        String task = plainTask();
        assertThat(assign(supervisor, task, "tecnico", TODAY).statusCode()).isEqualTo(200);
        assertThat(finishedAt(supervisor, task)).isNull();
        assertThat(technician.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", technician.csrf()).statusCode()).isEqualTo(200);
        assertThat(technician.postJson("/api/tasks/" + task + "/confirmations", "{\"location\":" + HERE + "}", technician.csrf()).statusCode()).isEqualTo(200);
        String finished = finishedAt(supervisor, task);
        assertThat(finished).isNotNull();
        assertThat(java.time.OffsetDateTime.parse(finished).toInstant()).isEqualTo(owner.queryForObject(
            "SELECT max(occurred_at) FROM sti.task_event WHERE task_id = ? AND to_status = 'FINALIZADO'", java.time.OffsetDateTime.class, UUID.fromString(task)).toInstant());
        // Reopened: "—" until it finishes again.
        var admin = browser("admin");
        assertThat(admin.postJson("/api/tasks/" + task + "/status", "{\"to\":\"EN_PROCESO\",\"location\":" + HERE + "}", admin.csrf()).statusCode()).isEqualTo(200);
        assertThat(finishedAt(supervisor, task)).isNull();
        assertThat(finishedAt(technician, task)).isNull();
    }

    // ------------------------------------------------------------------------------------------- races

    @Test void twoPeopleChangingTheDayAtOnceLeaveAChainedLogAndTheLastDay() throws Exception {
        List<String> failures = new ArrayList<>();
        for (int round = 0; round < ROUNDS; round++) {
            String task = plainTask();
            UUID id = UUID.fromString(task);
            assertThat(schedule(browser("admin"), task, TODAY).statusCode()).isEqualTo(200);
            var admin = browser("admin");
            var supervisor = browser("supervisor");
            String adminCsrf = admin.csrf(), supervisorCsrf = supervisor.csrf();
            List<HttpResponse<String>> results = together(List.<Callable<HttpResponse<String>>>of(
                () -> admin.postJson("/api/tasks/" + task + "/schedule", "{\"scheduledOn\":\"" + TODAY.plusDays(1) + "\"}", adminCsrf),
                () -> supervisor.postJson("/api/tasks/" + task + "/schedule", "{\"scheduledOn\":\"" + TODAY.plusDays(2) + "\"}", supervisorCsrf)));
            List<String> chain = owner.queryForList("SELECT coalesce(scheduled_from::text, '-') || '>' || scheduled_to FROM sti.task_event "
                + "WHERE task_id = ? AND kind = 'FECHA' ORDER BY occurred_at, id", String.class, id);
            String last = chain.get(chain.size() - 1);
            boolean chained = chain.size() == 3 && chain.get(1).startsWith(TODAY + ">") && chain.get(2).startsWith(chain.get(1).substring(chain.get(1).indexOf('>') + 1) + ">");
            if (results.stream().anyMatch(r -> r.statusCode() != 200) || !chained
                || !scheduled(id).toString().equals(last.substring(last.indexOf('>') + 1))) {
                failures.add("vuelta " + round + ": " + chain + " " + results.stream().map(ScheduleAndNamesTest::code).toList());
            }
        }
        System.out.println("CA-73 cambios de fecha simultáneos: " + failures.size() + " de " + ROUNDS + " vueltas con falla");
        assertThat(failures).isEmpty();
    }

    @Test void twoPeopleAssigningADatelessTaskWithDifferentDaysLeaveOneDay() throws Exception {
        List<String> failures = new ArrayList<>();
        Map<String, Integer> codes = new TreeMap<>();
        for (int round = 0; round < ROUNDS; round++) {
            String task = plainTask();
            UUID id = UUID.fromString(task);
            var admin = browser("admin");
            var supervisor = browser("supervisor");
            String adminCsrf = admin.csrf(), supervisorCsrf = supervisor.csrf();
            List<HttpResponse<String>> results = together(List.<Callable<HttpResponse<String>>>of(
                () -> admin.postJson("/api/tasks/" + task + "/assignments", assignment("tecnico", TODAY.plusDays(1)), adminCsrf),
                () -> supervisor.postJson("/api/tasks/" + task + "/assignments", assignment("tecnico2", TODAY.plusDays(2)), supervisorCsrf)));
            List<String> got = results.stream().map(ScheduleAndNamesTest::code).sorted().toList();
            for (String c : got) codes.merge(c, 1, Integer::sum);
            List<LocalDate> days = owner.queryForList("SELECT scheduled_to FROM sti.task_event WHERE task_id = ? AND kind = 'ASIGNADA'", LocalDate.class, id);
            if (!got.equals(List.of("200", "409 FECHA_DISTINTA")) || days.size() != 1 || !days.get(0).equals(scheduled(id))) {
                failures.add("vuelta " + round + ": " + got + " " + days);
            }
        }
        System.out.println("CA-73 asignaciones simultáneas con días distintos: " + failures.size() + " de " + ROUNDS + " vueltas con falla; " + codes);
        assertThat(failures).isEmpty();
    }

    // -------------------------------------------------------------------------------- C: names

    @Test void onlyTheAdminRenamesAndTheLogKeepsWhoWhenBeforeAndAfter() throws Exception {
        UUID client = UUID.randomUUID(), project = UUID.randomUUID();
        owner.update("INSERT INTO sti.client VALUES (?, ?)", client, "Renombrar " + TAG);
        owner.update("INSERT INTO sti.project VALUES (?, ?, ?)", project, client, "Obra " + TAG);
        for (String role : new String[]{"supervisor", "tecnico", "cliente"}) {
            var who = browser(role);
            assertThat(who.send("PUT", "/api/clients/" + client, "{\"name\":\"Nuevo " + TAG + "\"}", who.csrf()).statusCode()).as(role).isEqualTo(403);
            assertThat(who.send("PUT", "/api/projects/" + project, "{\"name\":\"Nueva " + TAG + "\"}", who.csrf()).statusCode()).as(role).isEqualTo(403);
            assertThat(who.get("/api/clients/" + client + "/summary").statusCode()).as(role).isEqualTo(403);
        }
        assertThat(new Browser().send("PUT", "/api/clients/" + client, "{\"name\":\"x\"}", null).statusCode()).isIn(401, 403);
        assertThat(clientName(client)).isEqualTo("Renombrar " + TAG);

        var admin = browser("admin");
        var renamed = admin.send("PUT", "/api/clients/" + client, "{\"name\":\"  Renombrada " + TAG + "  \"}", admin.csrf());
        assertThat(renamed.statusCode()).isEqualTo(200);
        assertThat(clientName(client)).isEqualTo("Renombrada " + TAG);
        assertThat(admin.send("PUT", "/api/projects/" + project, "{\"name\":\"Obra nueva " + TAG + "\"}", admin.csrf()).statusCode()).isEqualTo(200);
        assertThat(owner.queryForObject("SELECT client_id FROM sti.project WHERE id = ?", UUID.class, project)).isEqualTo(client);
        assertThat(owner.queryForList("""
            SELECT coalesce(e.client_id::text, 'p:' || e.project_id) || ' ' || e.old_name || ' > ' || e.new_name || ' ' || u.email
                   || ' ' || (e.occurred_at > now() - interval '5 minutes')
            FROM sti.catalog_name_edit e JOIN sti.app_user u ON u.id = e.actor_id
            WHERE e.client_id = ? OR e.project_id = ? ORDER BY e.occurred_at""", String.class, client, project)).containsExactly(
            client + " Renombrar " + TAG + " > Renombrada " + TAG + " " + email("admin") + " true",
            "p:" + project + " Obra " + TAG + " > Obra nueva " + TAG + " " + email("admin") + " true");
        // The board and the tasks read the name, not a copy: the new one shows at once.
        assertThat(admin.get("/api/clients").body()).contains("Renombrada " + TAG).doesNotContain("Renombrar " + TAG);
        assertThat(admin.send("PUT", "/api/clients/" + UUID.randomUUID(), "{\"name\":\"x " + TAG + "\"}", admin.csrf()).statusCode()).isEqualTo(404);
        assertThat(admin.send("PUT", "/api/clients/" + client, "{\"name\":\"   \"}", admin.csrf()).statusCode()).isEqualTo(400);
        assertThat(admin.send("PUT", "/api/clients/" + client, "{\"name\":\"" + "x".repeat(201) + "\"}", admin.csrf()).statusCode()).isEqualTo(400);
    }

    @Test void namesAreUniqueTrimmedAndWithoutCaseOnCreateAndEditButAnUnchangedNameSaves() throws Exception {
        var admin = browser("admin");
        UUID taken = UUID.randomUUID(), mine = UUID.randomUUID(), twinA = UUID.randomUUID(), twinB = UUID.randomUUID();
        owner.update("INSERT INTO sti.client VALUES (?, ?), (?, ?)", taken, "Ocupada " + TAG, mine, "Mía " + TAG);
        // Production may already repeat a name (no index, D-258): both twins exist.
        owner.update("INSERT INTO sti.client VALUES (?, ?), (?, ?)", twinA, "Gemela " + TAG, twinB, "Gemela " + TAG);

        var clash = admin.send("PUT", "/api/clients/" + mine, "{\"name\":\"  OCUPADA " + TAG.toUpperCase() + " \"}", admin.csrf());
        assertThat(code(clash)).isEqualTo("409 NOMBRE_REPETIDO");
        assertThat(JsonPath.<String>read(clash.body(), "$.message")).isEqualTo("Ya existe otra empresa con ese nombre.");
        assertThat(clientName(mine)).isEqualTo("Mía " + TAG);
        assertThat(code(admin.postJson("/api/clients", "{\"name\":\"ocupada " + TAG + "\"}", admin.csrf()))).isEqualTo("409 NOMBRE_REPETIDO");
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.client WHERE lower(name) = lower(?)", Integer.class, "Ocupada " + TAG)).isEqualTo(1);
        // D-265: saving a twin's own name is accepted, and logs nothing.
        assertThat(admin.send("PUT", "/api/clients/" + twinA, "{\"name\":\"Gemela " + TAG + "\"}", admin.csrf()).statusCode()).isEqualTo(200);
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.catalog_name_edit WHERE client_id = ?", Integer.class, twinA)).isZero();
        // Only a case change is a new name, and it matches the other twin.
        assertThat(code(admin.send("PUT", "/api/clients/" + twinA, "{\"name\":\"GEMELA " + TAG + "\"}", admin.csrf()))).isEqualTo("409 NOMBRE_REPETIDO");
        // A case change on a name nobody else has saves.
        assertThat(admin.send("PUT", "/api/clients/" + mine, "{\"name\":\"MÍA " + TAG + "\"}", admin.csrf()).statusCode()).isEqualTo(200);

        // Projects: unique within one client, free across clients.
        UUID p1 = UUID.randomUUID(), p2 = UUID.randomUUID();
        owner.update("INSERT INTO sti.project VALUES (?, ?, ?), (?, ?, ?)", p1, taken, "Sede " + TAG, p2, taken, "Depósito " + TAG);
        assertThat(code(admin.postJson("/api/projects", "{\"clientId\":\"" + taken + "\",\"name\":\" sede " + TAG + "\"}", admin.csrf()))).isEqualTo("409 NOMBRE_REPETIDO");
        assertThat(admin.postJson("/api/projects", "{\"clientId\":\"" + mine + "\",\"name\":\"Sede " + TAG + "\"}", admin.csrf()).statusCode()).isEqualTo(201);
        var projectClash = admin.send("PUT", "/api/projects/" + p2, "{\"name\":\"SEDE " + TAG + "\"}", admin.csrf());
        assertThat(code(projectClash)).isEqualTo("409 NOMBRE_REPETIDO");
        assertThat(JsonPath.<String>read(projectClash.body(), "$.message")).isEqualTo("Ese cliente ya tiene un proyecto con ese nombre.");
        assertThat(owner.queryForObject("SELECT name FROM sti.project WHERE id = ?", String.class, p2)).isEqualTo("Depósito " + TAG);
    }

    @Test void theEditPanelCountsReadTheDatabase() throws Exception {
        var admin = browser("admin");
        String a = plainTask(), b = plainTask();
        assertThat(assign(admin, a, "tecnico", TODAY).statusCode()).isEqualTo(200);
        String summary = admin.get("/api/projects/" + PROJECT + "/summary").body();
        Map<String, Integer> byStatus = JsonPath.read(summary, "$.byStatus");
        int tasks = owner.queryForObject("SELECT count(*) FROM sti.task WHERE project_id = ?", Integer.class, PROJECT);
        assertThat(JsonPath.<Integer>read(summary, "$.tasks")).isEqualTo(tasks);
        assertThat(byStatus.values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(tasks);
        assertThat(byStatus.get("POR_HACER")).isEqualTo(owner.queryForObject(
            "SELECT count(*) FROM sti.task WHERE project_id = ? AND status = 'POR_HACER'", Integer.class, PROJECT));
        String company = admin.get("/api/clients/" + COMPANY + "/summary").body();
        assertThat(JsonPath.<Integer>read(company, "$.projects")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(company, "$.tasks")).isEqualTo(tasks);
        assertThat(JsonPath.<Integer>read(company, "$.clientUsers")).isEqualTo(1);
        assertThat(admin.get("/api/projects/" + UUID.randomUUID() + "/summary").statusCode()).isEqualTo(404);
        assertThat(b).isNotEqualTo(a);
    }

    @Test void twoAdminsUsingTheSameNewNameAtOnceLeaveOne() throws Exception {
        List<String> failures = new ArrayList<>();
        Map<String, Integer> codes = new TreeMap<>();
        for (int round = 0; round < ROUNDS; round++) {
            String name = "Carrera " + UUID.randomUUID();
            UUID first = UUID.randomUUID(), second = UUID.randomUUID();
            owner.update("INSERT INTO sti.client VALUES (?, ?), (?, ?)", first, "Uno " + UUID.randomUUID(), second, "Dos " + UUID.randomUUID());
            var admin = browser("admin");
            var other = browser("admin2");
            String adminCsrf = admin.csrf(), otherCsrf = other.csrf();
            // One creates a company with the name while the other renames an existing one to it, and a third
            // request renames a second one to it as well.
            var third = browser("admin");
            String thirdCsrf = third.csrf();
            List<HttpResponse<String>> results = together(List.<Callable<HttpResponse<String>>>of(
                () -> admin.postJson("/api/clients", "{\"name\":\"" + name + "\"}", adminCsrf),
                () -> other.send("PUT", "/api/clients/" + first, "{\"name\":\"" + name.toUpperCase() + "\"}", otherCsrf),
                () -> third.send("PUT", "/api/clients/" + second, "{\"name\":\" " + name + " \"}", thirdCsrf)));
            List<String> got = results.stream().map(ScheduleAndNamesTest::code).toList();
            for (String c : got) codes.merge(c, 1, Integer::sum);
            int holders = owner.queryForObject("SELECT count(*) FROM sti.client WHERE lower(btrim(name)) = lower(?)", Integer.class, name);
            long ok = got.stream().filter(c -> c.startsWith("20")).count();
            if (holders != 1 || ok != 1 || got.stream().filter(c -> c.equals("409 NOMBRE_REPETIDO")).count() != 2) {
                failures.add("vuelta " + round + ": " + holders + " con el nombre " + got);
            }
        }
        System.out.println("CA-73 nombres simultáneos: " + failures.size() + " de " + ROUNDS + " vueltas con falla; " + codes);
        assertThat(failures).isEmpty();
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private String plainTask() throws Exception {
        var admin = browser("admin");
        var response = admin.postJson("/api/tasks", newTask("Tarea " + UUID.randomUUID(), ""), admin.csrf());
        assertThat(response.statusCode()).isEqualTo(201);
        return JsonPath.read(response.body(), "$.id");
    }

    private HttpResponse<String> assign(Browser who, String task, String person, LocalDate day) throws Exception {
        return who.postJson("/api/tasks/" + task + "/assignments", assignment(person, day), who.csrf());
    }

    private static String assignment(String person, LocalDate day) {
        return "{\"userId\":\"" + userId(person) + "\"" + (day == null ? "" : ",\"scheduledOn\":\"" + day + "\"") + "}";
    }

    private HttpResponse<String> schedule(Browser who, String task, LocalDate day) throws Exception {
        return who.postJson("/api/tasks/" + task + "/schedule", "{\"scheduledOn\":\"" + day + "\"}", who.csrf());
    }

    private String finishedAt(Browser who, String task) throws Exception {
        return JsonPath.read(who.get("/api/tasks/" + task).body(), "$.finishedAt");
    }

    private static LocalDate scheduled(UUID task) {
        return owner.queryForObject("SELECT scheduled_on FROM sti.task WHERE id = ?", LocalDate.class, task);
    }

    private static String clientName(UUID client) {
        return owner.queryForObject("SELECT name FROM sti.client WHERE id = ?", String.class, client);
    }

    private static int tasksTitled(String title) {
        return owner.queryForObject("SELECT count(*) FROM sti.task WHERE title = ?", Integer.class, title);
    }

    private static String code(HttpResponse<String> response) {
        if (response.statusCode() == 200 || response.statusCode() == 201) return String.valueOf(response.statusCode());
        try {
            String code = JsonPath.read(response.body(), "$.code");
            return response.statusCode() + " " + code;
        } catch (RuntimeException noCode) {
            return String.valueOf(response.statusCode());
        }
    }

    private static String newTask(String title, String extra) {
        return "{\"projectId\":\"" + PROJECT + "\",\"title\":\"" + title + "\",\"location\":" + HERE + extra + "}";
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
            return send("POST", path, body, csrf);
        }
        HttpResponse<String> send(String method, String path, String body, String csrf) throws Exception {
            var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
            if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
            return client.send(request.method(method, HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
