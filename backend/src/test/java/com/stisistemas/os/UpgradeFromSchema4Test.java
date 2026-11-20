package com.stisistemas.os;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * CA-42, the update half: V5 over a database that stands at schema 4 with data, as production stands today (Flyway
 * in 4, real accounts). Everything that was there is still there, byte for byte; the new tables are empty and the
 * runtime role can use them; the account log accepts the two new kinds and still the six it had. The clean install
 * is every other test class, which start from an empty database.
 */
class UpgradeFromSchema4Test {
    // Since corte 3A the same database continues to schema 6 (CA-54): see schema6OverSchema5WithData.
    static final String[] OLD_KINDS = {"ALTA", "EDICION", "ACTIVACION", "DESACTIVACION", "RESTABLECIMIENTO", "CAMBIO_CONTRASENA"};

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + key);
        return value;
    }

    private static Flyway flyway(String url, String target) {
        var configuration = Flyway.configure().dataSource(url, required("STI_MIGRATION_USER"), required("STI_MIGRATION_PASSWORD"))
            .schemas("sti").defaultSchema("sti").createSchemas(false);
        if (target != null) configuration.target(target);
        return configuration.load();
    }

    @Test void schema5OverSchema4WithDataKeepsEverythingAndAddsOnly() {
        String url = required("STI_UPGRADE4_DB_URL");
        flyway(url, "4").migrate();
        var owner = new JdbcTemplate(new DriverManagerDataSource(url, required("STI_MIGRATION_USER"), required("STI_MIGRATION_PASSWORD")));
        assertThat(owner.queryForObject("SELECT max(version::int) FROM sti.flyway_schema_history WHERE success", Integer.class)).isEqualTo(4);

        // Data as it stood at schema 4: a company, a project, accounts (one still on its initial password), and the
        // account log with every kind there was.
        UUID company = UUID.randomUUID(), project = UUID.randomUUID(), admin = UUID.randomUUID(), pending = UUID.randomUUID(), client = UUID.randomUUID();
        String hash = new BCryptPasswordEncoder(12).encode("Clave-de-prueba-" + UUID.randomUUID());
        owner.update("INSERT INTO sti.client VALUES (?, 'Cliente cuatro')", company);
        owner.update("INSERT INTO sti.project VALUES (?, ?, 'Proyecto cuatro')", project, company);
        owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,phone) VALUES (?,?,?,?,?,?)", admin, "admin4@correo-prueba.com", "Admin cuatro", hash, "ADMIN", "021 555 123");
        owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,must_change_password) VALUES (?,?,?,?,?,true)", pending, "pendiente4@correo-prueba.com", "Pendiente cuatro", hash, "USUARIO");
        owner.update("INSERT INTO sti.app_user(id,email,display_name,password_hash,role,client_id,enabled) VALUES (?,?,?,?,?,?,false)", client, "cliente4@correo-prueba.com", "Cliente cuatro", hash, "CLIENTE", company);
        for (String kind : OLD_KINDS) owner.update("INSERT INTO sti.account_event(id, account_id, actor_id, kind, changes) VALUES (?,?,?,?,'{\"k\":1}'::jsonb)", UUID.randomUUID(), pending, admin, kind);
        List<String> before = snapshot(owner);
        assertThat(before).isNotEmpty();

        flyway(url, "5").migrate();

        assertThat(owner.queryForObject("SELECT max(version::int) FROM sti.flyway_schema_history WHERE success", Integer.class)).isEqualTo(5);
        assertThat(snapshot(owner)).as("every row that existed is the same, byte for byte").isEqualTo(before);
        for (String table : new String[]{"mail_outbox", "mail_attempt", "password_reset_token"}) {
            assertThat(owner.queryForObject("SELECT count(*) FROM sti." + table, Integer.class)).as(table + " starts empty").isZero();
        }
        // Applying it again changes nothing.
        assertThat(flyway(url, "5").migrate().migrationsExecuted).isZero();

        // The log takes the two new kinds and keeps the six it had; nothing else.
        for (String kind : new String[]{"RECUPERACION_CORREO", "BLOQUEO_INGRESO"}) {
            owner.update("INSERT INTO sti.account_event(id, account_id, actor_id, kind) VALUES (?,?,?,?)", UUID.randomUUID(), pending, pending, kind);
        }
        for (String kind : OLD_KINDS) owner.update("INSERT INTO sti.account_event(id, account_id, actor_id, kind) VALUES (?,?,?,?)", UUID.randomUUID(), pending, admin, kind);
        assertThatThrownBy(() -> owner.update("INSERT INTO sti.account_event(id, account_id, actor_id, kind) VALUES (?,?,?,'OTRO')", UUID.randomUUID(), pending, admin))
            .hasMessageContaining("account_event_kind_check");

        // The role the application runs with can use what is new (the owner's default privileges reach the new tables).
        var runtime = new JdbcTemplate(new DriverManagerDataSource(url, required("STI_DB_USER"), required("STI_DB_PASSWORD")));
        UUID row = UUID.randomUUID();
        runtime.update("INSERT INTO sti.mail_outbox(id, account_id, kind, status) VALUES (?,?, 'RECUPERACION', 'PENDIENTE')", row, pending);
        runtime.update("INSERT INTO sti.mail_attempt(id, outbox_id, account_id, kind, attempt, result) VALUES (?,?,?, 'RECUPERACION', 1, 'ENVIADO')", UUID.randomUUID(), row, pending);
        runtime.update("INSERT INTO sti.password_reset_token(id, account_id, outbox_id, token_hash, expires_at) VALUES (?,?,?,?, clock_timestamp() + interval '30 minutes')",
            UUID.randomUUID(), pending, row, new byte[32]);
        assertThat(runtime.queryForObject("SELECT count(*) FROM sti.password_reset_token", Integer.class)).isEqualTo(1);
        // A token hash has to be 32 bytes, and an outbox row that is not waiting has to say when it finished.
        assertThatThrownBy(() -> runtime.update("INSERT INTO sti.password_reset_token(id, account_id, token_hash, expires_at) VALUES (?,?,?, now())", UUID.randomUUID(), pending, new byte[5]))
            .hasMessageContaining("token_hash");
        assertThatThrownBy(() -> runtime.update("INSERT INTO sti.mail_outbox(id, kind, status) VALUES (?, 'RECUPERACION', 'ENVIADO')", UUID.randomUUID()))
            .hasMessageContaining("mail_outbox");
        // The migrations that were already applied are untouched.
        assertThat(owner.queryForList("SELECT version FROM sti.flyway_schema_history WHERE success ORDER BY installed_rank", String.class)).containsExactly("1", "2", "3", "4", "5");

        schema6OverSchema5WithData(owner, runtime, url, admin, project);
    }

    /**
     * CA-54 (corte 3A): V6 over the same database, now at schema 5 with tasks in every status there was, their log,
     * assignments and a signature. Everything stays; the new reason columns start empty; the status list grows by
     * NO_FACTURABLE and nothing else.
     */
    private static void schema6OverSchema5WithData(JdbcTemplate owner, JdbcTemplate runtime, String url, UUID admin, UUID project) {
        String[] statuses = {"POR_HACER", "EN_PROCESO", "FINALIZADO", "FACTURADO", "ANULADA"};
        UUID signed = null;
        for (String status : statuses) {
            UUID task = UUID.randomUUID();
            owner.update("INSERT INTO sti.task(id, project_id, title, status, created_by) VALUES (?,?,?,?,?)", task, project, "Tarea " + status, status, admin);
            owner.update("INSERT INTO sti.task_assignment(task_id, user_id, confirmed_at) VALUES (?,?, CASE WHEN ? THEN now() END)", task, admin, !status.startsWith("P") && !status.startsWith("E"));
            owner.update("INSERT INTO sti.task_event(id, task_id, kind, from_status, to_status, actor_id, location_absent_reason) VALUES (?,?, 'ESTADO', 'POR_HACER', ?, ?, 'Sin ubicación (prueba)')", UUID.randomUUID(), task, status, admin);
            if (status.equals("FACTURADO")) signed = task;
        }
        owner.update("INSERT INTO sti.task_signature(id, task_id, signer_name, signed_on, storage_name, byte_size, presented_by, remote, location_absent_reason) "
            + "VALUES (?,?, 'José Peña', current_date, 'firma-prueba-6.png', 70, ?, false, 'Sin ubicación (prueba)')", UUID.randomUUID(), signed, admin);
        List<String> before = snapshot6(owner);

        flyway(url, null).migrate();

        assertThat(owner.queryForObject("SELECT max(version::int) FROM sti.flyway_schema_history WHERE success", Integer.class)).isEqualTo(6);
        assertThat(snapshot6(owner)).as("every row that existed at schema 5 is the same").isEqualTo(before);
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task WHERE closing_reason IS NOT NULL", Integer.class)).isZero();
        assertThat(owner.queryForObject("SELECT count(*) FROM sti.task_event WHERE closing_reason IS NOT NULL", Integer.class)).isZero();
        assertThat(flyway(url, null).migrate().migrationsExecuted).isZero();

        // The runtime role closes a task as not billable, with the reason in the task and in its event.
        UUID task = owner.queryForObject("SELECT id FROM sti.task WHERE status = 'FINALIZADO' AND project_id = ?", UUID.class, project);
        runtime.update("UPDATE sti.task SET status = 'NO_FACTURABLE', closing_reason = 'GARANTIA' WHERE id = ?", task);
        runtime.update("INSERT INTO sti.task_event(id, task_id, kind, from_status, to_status, actor_id, location_absent_reason, closing_reason) "
            + "VALUES (?,?, 'ESTADO', 'FINALIZADO', 'NO_FACTURABLE', ?, 'Sin ubicación (prueba)', 'GARANTIA')", UUID.randomUUID(), task, admin);
        // Status and reason go together; the reason is one of two; an event other than the closing carries none.
        assertThatThrownBy(() -> runtime.update("UPDATE sti.task SET closing_reason = NULL WHERE id = ?", task)).hasMessageContaining("task_closing_reason_status_check");
        assertThatThrownBy(() -> runtime.update("UPDATE sti.task SET closing_reason = 'CORTESIA' WHERE id = ?", task)).hasMessageContaining("closing_reason");
        assertThatThrownBy(() -> runtime.update("UPDATE sti.task SET status = 'CERRADA' WHERE status = 'POR_HACER' AND project_id = ?", project)).hasMessageContaining("task_status_check");
        assertThatThrownBy(() -> runtime.update("INSERT INTO sti.task_event(id, task_id, kind, from_status, to_status, actor_id, location_absent_reason, closing_reason) "
            + "VALUES (?,?, 'ESTADO', 'NO_FACTURABLE', 'FINALIZADO', ?, 'x', 'GARANTIA')", UUID.randomUUID(), task, admin)).hasMessageContaining("task_event_closing_reason_kind_check");
        assertThat(owner.queryForList("SELECT version FROM sti.flyway_schema_history WHERE success ORDER BY installed_rank", String.class)).containsExactly("1", "2", "3", "4", "5", "6");
    }

    /** Rows of every table at schema 5, without the two columns V6 adds (they are checked apart). */
    private static List<String> snapshot6(JdbcTemplate owner) {
        var out = new java.util.ArrayList<String>();
        for (String table : new String[]{"client", "project", "app_user", "account_event", "task", "task_assignment", "task_event",
                                         "task_signature", "mail_outbox", "mail_attempt", "password_reset_token"}) {
            out.addAll(owner.queryForList("SELECT '" + table + ":' || (to_jsonb(t) - 'closing_reason')::text FROM sti." + table + " t ORDER BY 1", String.class));
        }
        return out;
    }

    /** One text per row of every table that existed at schema 4, so that "the same" is not a matter of counting. */
    private static List<String> snapshot(JdbcTemplate owner) {
        var out = new java.util.ArrayList<String>();
        for (String table : new String[]{"client", "project", "app_user", "account_event"}) {
            out.addAll(owner.queryForList("SELECT '" + table + ":' || row_to_json(t)::text FROM sti." + table + " t ORDER BY 1", String.class));
        }
        return out;
    }
}
