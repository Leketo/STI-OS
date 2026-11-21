package com.stisistemas.os.catalog;

import com.stisistemas.os.Refusal;
import com.stisistemas.os.identity.Accounts;
import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class CatalogController {
    private final JdbcTemplate jdbc;
    private final Accounts accounts;
    public CatalogController(JdbcTemplate jdbc, Accounts accounts) { this.jdbc = jdbc; this.accounts = accounts; }

    record Client(UUID id, String name) {}
    record Project(UUID id, UUID clientId, String name) {}
    record NewClient(String name) {}
    record NewProject(UUID clientId, String name) {}
    record Rename(String name) {}
    record ClientSummary(int projects, int tasks, int clientUsers) {}
    record ProjectSummary(int tasks, Map<String, Integer> byStatus) {}

    /**
     * Corte 3B (R-05, D-258): names compare trimmed and without case. There is no unique index (production may
     * already hold repeated names), so creations and renames of the same kind take a transaction lock first: two
     * requests with the same new name cannot both pass the check.
     */
    private static final String SAME_NAME = "lower(btrim(name)) = lower(btrim(?))";

    private void lockNames(String scope) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtext(?))", "sti.catalog.names:" + scope);
    }

    private void requireAdmin(Principal principal) {
        if (!accounts.active(principal.getName()).role().equals("ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    private static String checkedName(String name) {
        if (name == null || name.trim().isEmpty() || name.trim().length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return name.trim();
    }

    private void clientNameFree(String name, UUID except) {
        Integer taken = jdbc.queryForObject("SELECT count(*) FROM sti.client WHERE " + SAME_NAME
            + " AND id IS DISTINCT FROM ?", Integer.class, name, except);
        if (taken != null && taken > 0) {
            throw new Refusal(HttpStatus.CONFLICT, "NOMBRE_REPETIDO", "Ya existe otra empresa con ese nombre.");
        }
    }

    private void projectNameFree(UUID clientId, String name, UUID except) {
        Integer taken = jdbc.queryForObject("SELECT count(*) FROM sti.project WHERE client_id = ? AND " + SAME_NAME
            + " AND id IS DISTINCT FROM ?", Integer.class, clientId, name, except);
        if (taken != null && taken > 0) {
            throw new Refusal(HttpStatus.CONFLICT, "NOMBRE_REPETIDO", "Ese cliente ya tiene un proyecto con ese nombre.");
        }
    }

    @PostMapping("/api/clients")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    Client createClient(@RequestBody NewClient input, Principal principal) {
        requireAdmin(principal);
        String name = checkedName(input == null ? null : input.name());
        lockNames("client");
        clientNameFree(name, null);
        Client client = new Client(UUID.randomUUID(), name);
        jdbc.update("INSERT INTO sti.client (id, name) VALUES (?, ?)", client.id(), client.name());
        return client;
    }

    @GetMapping("/api/clients")
    List<Client> clients(Principal principal) {
        var account = accounts.active(principal.getName());
        boolean customer = account.role().equals("CLIENTE");
        return jdbc.query("SELECT id, name FROM sti.client" + (customer ? " WHERE id = ?" : "") + " ORDER BY name, id",
            (rs, n) -> new Client(rs.getObject("id", UUID.class), rs.getString("name")),
            customer ? new Object[]{account.clientId()} : new Object[]{});
    }

    /** ADMIN only. A task always lives inside an existing project of exactly one company. */
    @PostMapping("/api/projects")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    Project createProject(@RequestBody NewProject input, Principal principal) {
        requireAdmin(principal);
        if (input == null || input.clientId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String name = checkedName(input.name());
        Integer client = jdbc.queryForObject("SELECT count(*) FROM sti.client WHERE id = ?", Integer.class, input.clientId());
        if (client == null || client == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        lockNames("project:" + input.clientId());
        projectNameFree(input.clientId(), name, null);
        Project project = new Project(UUID.randomUUID(), input.clientId(), name);
        jdbc.update("INSERT INTO sti.project (id, client_id, name) VALUES (?, ?, ?)", project.id(), project.clientId(), project.name());
        return project;
    }

    @GetMapping("/api/projects")
    List<Project> projects(Principal principal) {
        var account = accounts.active(principal.getName());
        boolean customer = account.role().equals("CLIENTE");
        return jdbc.query("SELECT id, client_id, name FROM sti.project" + (customer ? " WHERE client_id = ?" : "") + " ORDER BY name, id LIMIT 100",
            (rs, n) -> new Project(rs.getObject("id", UUID.class), rs.getObject("client_id", UUID.class), rs.getString("name")),
            customer ? new Object[]{account.clientId()} : new Object[]{});
    }

    @GetMapping("/api/projects/{id}")
    Project project(@PathVariable UUID id, Principal principal) {
        var account = accounts.active(principal.getName());
        boolean customer = account.role().equals("CLIENTE");
        return jdbc.query("SELECT id, client_id, name FROM sti.project WHERE id = ?" + (customer ? " AND client_id = ?" : ""),
            (rs, n) -> new Project(rs.getObject("id", UUID.class), rs.getObject("client_id", UUID.class), rs.getString("name")),
            customer ? new Object[]{id, account.clientId()} : new Object[]{id})
            .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    /**
     * Corte 3B (R-05, boceto 7.4): ADMIN renames a company. Saving the name it already has is accepted even if
     * another company repeats it (D-265); a different name that matches another company is refused with 409.
     */
    @PutMapping("/api/clients/{id}")
    @Transactional
    Client renameClient(@PathVariable UUID id, @RequestBody Rename input, Principal principal) {
        requireAdmin(principal);
        String name = checkedName(input == null ? null : input.name());
        lockNames("client");
        String current = jdbc.query("SELECT name FROM sti.client WHERE id = ? FOR UPDATE", (rs, n) -> rs.getString(1), id)
            .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (current.equals(name)) return new Client(id, name);
        clientNameFree(name, id);
        jdbc.update("UPDATE sti.client SET name = ? WHERE id = ?", name, id);
        jdbc.update("INSERT INTO sti.catalog_name_edit (id, client_id, old_name, new_name, actor_id) VALUES (?,?,?,?,?)",
            UUID.randomUUID(), id, current, name, accounts.active(principal.getName()).id());
        return new Client(id, name);
    }

    /** Corte 3B (boceto 7.5): ADMIN renames a project. The client never changes: its tasks belong to that company. */
    @PutMapping("/api/projects/{id}")
    @Transactional
    Project renameProject(@PathVariable UUID id, @RequestBody Rename input, Principal principal) {
        requireAdmin(principal);
        String name = checkedName(input == null ? null : input.name());
        UUID clientId = jdbc.query("SELECT client_id FROM sti.project WHERE id = ?",
                (rs, n) -> rs.getObject(1, UUID.class), id)
            .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        lockNames("project:" + clientId);
        String current = jdbc.queryForObject("SELECT name FROM sti.project WHERE id = ? FOR UPDATE", String.class, id);
        if (name.equals(current)) return new Project(id, clientId, name);
        projectNameFree(clientId, name, id);
        jdbc.update("UPDATE sti.project SET name = ? WHERE id = ?", name, id);
        jdbc.update("INSERT INTO sti.catalog_name_edit (id, project_id, old_name, new_name, actor_id) VALUES (?,?,?,?,?)",
            UUID.randomUUID(), id, current, name, accounts.active(principal.getName()).id());
        return new Project(id, clientId, name);
    }

    /** The counts of the edit panel (boceto 7.4). ADMIN only; tasks of every status, cancelled included. */
    @GetMapping("/api/clients/{id}/summary")
    ClientSummary clientSummary(@PathVariable UUID id, Principal principal) {
        requireAdmin(principal);
        return jdbc.query("""
            SELECT (SELECT count(*) FROM sti.project p WHERE p.client_id = c.id) AS projects,
                   (SELECT count(*) FROM sti.task t JOIN sti.project p ON p.id = t.project_id WHERE p.client_id = c.id) AS tasks,
                   (SELECT count(*) FROM sti.app_user u WHERE u.client_id = c.id AND u.role = 'CLIENTE') AS client_users
            FROM sti.client c WHERE c.id = ?""",
            (rs, n) -> new ClientSummary(rs.getInt("projects"), rs.getInt("tasks"), rs.getInt("client_users")), id)
            .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    /** The counts of the edit panel (boceto 7.5): the project's tasks, by status. ADMIN only. */
    @GetMapping("/api/projects/{id}/summary")
    ProjectSummary projectSummary(@PathVariable UUID id, Principal principal) {
        requireAdmin(principal);
        Integer found = jdbc.queryForObject("SELECT count(*) FROM sti.project WHERE id = ?", Integer.class, id);
        if (found == null || found == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        jdbc.query("SELECT status, count(*) AS n FROM sti.task WHERE project_id = ? GROUP BY status ORDER BY status",
            rs -> { byStatus.put(rs.getString("status"), rs.getInt("n")); }, id);
        return new ProjectSummary(byStatus.values().stream().mapToInt(Integer::intValue).sum(), byStatus);
    }
}
