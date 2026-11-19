package com.stisistemas.os.identity;

import com.stisistemas.os.Refusal;
import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * User management (ENCARGO-DEV-002). Every operation here is ADMIN only (rule 8). The ADMIN never writes a
 * password: the system draws an initial one at creation and at reset, and it appears only in that response.
 */
@RestController
public class AccountController {
    static final Set<String> ROLES = Set.of("ADMIN", "SUPERVISOR", "USUARIO", "CLIENTE");
    static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    static final Pattern PHONE = Pattern.compile("^[0-9 +()-]{1,30}$");
    private final JdbcTemplate jdbc;
    private final Accounts accounts;
    private final PasswordEncoder passwords;

    public AccountController(JdbcTemplate jdbc, Accounts accounts, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.passwords = passwords;
    }

    /** A password field, if a client still sends one, is ignored: the system draws the password (D-23). */
    public record NewAccount(String name, String email, String phone, String role, UUID clientId) {}
    public record AccountChange(String name, String email, String phone, String role, UUID clientId, Boolean active) {}

    /**
     * One person as the list shows it. {@code assignedTasks} counts what the board shows filtered by that person:
     * every task but the cancelled ones (D-84). {@code pendingInProgress} counts tasks in progress the person has
     * not confirmed, for the warning before deactivating (D-82).
     */
    public record Person(UUID id, String name, String email, String phone, String role, UUID clientId, String clientName,
                         boolean active, boolean mustChangePassword, int assignedTasks, int pendingInProgress) {}

    public record Created(Person account, String initialPassword) {}
    public record Reset(Person account, String initialPassword) {}

    @GetMapping("/api/accounts")
    List<Person> list(Principal principal) {
        admin(principal);
        return jdbc.query(PEOPLE + " ORDER BY u.display_name, u.email", (rs, n) -> person(rs));
    }

    @GetMapping("/api/accounts/{id}")
    Person one(@PathVariable UUID id, Principal principal) {
        admin(principal);
        return find(id);
    }

    @PostMapping("/api/accounts")
    @Transactional
    ResponseEntity<Created> create(@RequestBody NewAccount input, Principal principal) {
        var actor = admin(principal);
        if (input == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String name = name(input.name());
        String email = email(input.email());
        String phone = phone(input.phone());
        String role = role(input.role());
        UUID clientId = company(role, input.clientId());
        String password = Accounts.initialPassword();
        UUID id = UUID.randomUUID();
        try {
            jdbc.update("""
                INSERT INTO sti.app_user (id, display_name, email, password_hash, role, client_id, phone, must_change_password)
                VALUES (?, ?, ?, ?, ?, ?, ?, true)""", id, name, email, passwords.encode(password), role, clientId, phone);
        } catch (DuplicateKeyException duplicate) {
            throw emailTaken();
        }
        var fields = new LinkedHashMap<String, Object>();
        fields.put("nombre", name);
        fields.put("correo", email);
        fields.put("telefono", phone);
        fields.put("rol", role);
        fields.put("empresa", clientId);
        accounts.log(id, actor.id(), "ALTA", fields);
        return once(HttpStatus.CREATED, new Created(find(id), password));
    }

    @PutMapping("/api/accounts/{id}")
    @Transactional
    Person update(@PathVariable UUID id, @RequestBody AccountChange input, Principal principal) {
        var actor = admin(principal);
        if (input == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        serializeAccountChanges();
        var before = find(id);
        boolean self = before.id().equals(actor.id());
        String name = input.name() == null ? before.name() : name(input.name());
        String email = input.email() == null ? before.email() : email(input.email());
        String phone = input.phone() == null ? before.phone() : phone(input.phone());
        String role = input.role() == null ? before.role() : role(input.role());
        boolean active = input.active() == null ? before.active() : input.active();
        // Leaving CLIENTE removes the company (rule 6). A company sent with another role is refused, as on creation.
        UUID clientId = company(role, role.equals("CLIENTE") && input.clientId() == null ? before.clientId() : input.clientId());

        if (self && !role.equals(before.role())) {
            throw new Refusal(HttpStatus.CONFLICT, "PROPIO_ROL", "No podés cambiar tu propio rol. Lo cambia otro administrador.");
        }
        if (self && !active) {
            throw new Refusal(HttpStatus.CONFLICT, "PROPIA_CUENTA", "No podés desactivar tu propia cuenta.");
        }
        boolean losesAdmin = before.role().equals("ADMIN") && before.active() && (!role.equals("ADMIN") || !active);
        if (losesAdmin && count("SELECT count(*) FROM sti.app_user WHERE role = 'ADMIN' AND enabled AND id <> ?", id) == 0) {
            throw new Refusal(HttpStatus.CONFLICT, "ULTIMO_ADMIN",
                "Es el último administrador activo. Antes de cambiarlo, otra persona tiene que ser administradora.");
        }
        if (role.equals("CLIENTE") && !before.role().equals("CLIENTE") && count("""
            SELECT count(*) FROM sti.task_assignment a JOIN sti.task t ON t.id = a.task_id
            WHERE a.user_id = ? AND t.status IN ('POR_HACER', 'EN_PROCESO')""", id) > 0) {
            throw new Refusal(HttpStatus.CONFLICT, "TAREAS_ABIERTAS",
                "Tiene tareas abiertas asignadas. Antes de pasarla a Cliente, reasigná o cerrá esas tareas.");
        }

        try {
            jdbc.update("UPDATE sti.app_user SET display_name = ?, email = ?, phone = ?, role = ?, client_id = ?, enabled = ? WHERE id = ?",
                name, email, phone, role, clientId, active, id);
        } catch (DuplicateKeyException duplicate) {
            throw emailTaken();
        }
        var changes = new LinkedHashMap<String, Object>();
        change(changes, "nombre", before.name(), name);
        change(changes, "correo", before.email(), email);
        change(changes, "telefono", before.phone(), phone);
        change(changes, "rol", before.role(), role);
        change(changes, "empresa", before.clientId(), clientId);
        if (!changes.isEmpty()) accounts.log(id, actor.id(), "EDICION", changes);
        if (active != before.active()) accounts.log(id, actor.id(), active ? "ACTIVACION" : "DESACTIVACION", Map.of());

        // Rule 6: a new email ends the sessions held under the old one. Rule 5: deactivating ends them all.
        if (!email.equals(before.email()) || !active) accounts.endSessions(before.email(), null);
        return find(id);
    }

    @PostMapping("/api/accounts/{id}/password-reset")
    @Transactional
    ResponseEntity<Reset> reset(@PathVariable UUID id, Principal principal) {
        var actor = admin(principal);
        serializeAccountChanges();
        var target = find(id);
        if (target.id().equals(actor.id())) {
            throw new Refusal(HttpStatus.CONFLICT, "PROPIA_CONTRASENA",
                "Tu propia contraseña no se restablece desde acá. Cambiala desde «Mi contraseña», en tu menú.");
        }
        String password = Accounts.initialPassword();
        jdbc.update("UPDATE sti.app_user SET password_hash = ?, must_change_password = true WHERE id = ?",
            passwords.encode(password), id);
        accounts.endSessions(target.email(), null);
        accounts.log(id, actor.id(), "RESTABLECIMIENTO", Map.of());
        return once(HttpStatus.OK, new Reset(find(id), password));
    }

    /** Rule 8. Inactive accounts never get here: the account state filter ends their session first. */
    private Accounts.Account admin(Principal principal) {
        var account = accounts.active(principal.getName());
        if (!account.role().equals("ADMIN")) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return account;
    }

    /**
     * One account change at a time, across all accounts: two ADMINs demoting or deactivating each other at once
     * would otherwise both see the other one still active, and leave no active ADMIN.
     */
    private void serializeAccountChanges() {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(19283, 2)");
    }

    private Person find(UUID id) {
        return jdbc.query(PEOPLE + " WHERE u.id = ?", (rs, n) -> person(rs), id).stream().findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static final String PEOPLE = """
        SELECT u.id, u.display_name, u.email, u.phone, u.role, u.client_id, c.name AS client_name, u.enabled,
               u.must_change_password,
               (SELECT count(*) FROM sti.task_assignment a JOIN sti.task t ON t.id = a.task_id
                 WHERE a.user_id = u.id AND t.status <> 'ANULADA') AS assigned_tasks,
               (SELECT count(*) FROM sti.task_assignment a JOIN sti.task t ON t.id = a.task_id
                 WHERE a.user_id = u.id AND t.status = 'EN_PROCESO' AND a.confirmed_at IS NULL) AS pending_in_progress
        FROM sti.app_user u LEFT JOIN sti.client c ON c.id = u.client_id""";

    private static Person person(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Person(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("email"),
            rs.getString("phone"), rs.getString("role"), rs.getObject("client_id", UUID.class), rs.getString("client_name"),
            rs.getBoolean("enabled"), rs.getBoolean("must_change_password"), rs.getInt("assigned_tasks"),
            rs.getInt("pending_in_progress"));
    }

    /** Rule 1: the response that carries an initial password is never stored by a cache. */
    private static <T> ResponseEntity<T> once(HttpStatus status, T body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("Pragma", "no-cache").body(body);
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }

    private static void change(Map<String, Object> changes, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            var pair = new LinkedHashMap<String, Object>();
            pair.put("antes", before);
            pair.put("despues", after);
            changes.put(field, pair);
        }
    }

    private static String name(String value) {
        String name = value == null ? "" : value.trim();
        if (name.isEmpty() || name.length() > 200) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "NOMBRE", "Escribí el nombre y apellido, hasta 200 caracteres.");
        }
        return name;
    }

    private static String email(String value) {
        String email = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || !EMAIL.matcher(email).matches()) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "CORREO", "Escribí un correo válido.");
        }
        return email;
    }

    /** Optional (D-24): blank means none. */
    static String phone(String value) {
        if (value == null || value.isBlank()) return null;
        String phone = value.trim();
        if (!PHONE.matcher(phone).matches()) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "TELEFONO",
                "El teléfono admite hasta 30 caracteres: dígitos, espacios, +, - y paréntesis.");
        }
        return phone;
    }

    private static String role(String value) {
        if (value == null || !ROLES.contains(value)) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "ROL", "Elegí un rol válido.");
        }
        return value;
    }

    /** A CLIENTE belongs to exactly one existing company; every other role to none (rule 6). */
    private UUID company(String role, UUID clientId) {
        if (!role.equals("CLIENTE")) {
            if (clientId != null) throw new Refusal(HttpStatus.BAD_REQUEST, "EMPRESA", "Solo una cuenta Cliente tiene empresa.");
            return null;
        }
        if (clientId == null || count("SELECT count(*) FROM sti.client WHERE id = ?", clientId) == 0) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "EMPRESA", "Para el rol Cliente elegí la empresa.");
        }
        return clientId;
    }

    private static Refusal emailTaken() {
        return new Refusal(HttpStatus.CONFLICT, "CORREO_EN_USO", "Ya hay una cuenta con ese correo.");
    }
}
