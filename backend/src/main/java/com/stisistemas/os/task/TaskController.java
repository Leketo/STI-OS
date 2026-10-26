package com.stisistemas.os.task;

import com.stisistemas.os.identity.Accounts;
import java.security.Principal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class TaskController {
    private static final Set<String> OPERATORS = Set.of("ADMIN", "SUPERVISOR");
    private static final Set<String> REQUESTABLE = Set.of("POR_HACER", "EN_PROCESO", "ANULADA");
    private static final Set<String> OPEN = Set.of("POR_HACER", "EN_PROCESO");
    private final JdbcTemplate jdbc;
    private final Accounts accounts;
    private final Tasks tasks;

    public TaskController(JdbcTemplate jdbc, Accounts accounts, Tasks tasks) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.tasks = tasks;
    }

    record Operator(UUID id, String name, String role) {}
    record NewTask(UUID projectId, String title, String detail, Tasks.Location location) {}
    record NewAssignment(UUID userId) {}
    record StatusChange(String to, Tasks.Location location) {}
    record Confirmation(Tasks.Location location) {}

    @GetMapping("/api/operators")
    List<Operator> operators(Principal principal) {
        if (!OPERATORS.contains(accounts.active(principal.getName()).role())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return jdbc.query("SELECT id, display_name, role FROM sti.app_user WHERE enabled AND role <> 'CLIENTE' ORDER BY display_name, id",
            (rs, n) -> new Operator(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("role")));
    }

    @GetMapping("/api/tasks")
    List<Tasks.Task> list(@RequestParam(required = false) UUID projectId, @RequestParam(required = false) String status,
                          Principal principal) {
        return tasks.list(accounts.active(principal.getName()), projectId, status);
    }

    @GetMapping("/api/tasks/{id}")
    Tasks.Detail detail(@PathVariable UUID id, Principal principal) {
        return tasks.detail(id, accounts.active(principal.getName()));
    }

    @PostMapping("/api/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    Tasks.Task create(@RequestBody NewTask input, Principal principal) {
        var account = accounts.active(principal.getName());
        if (input == null || input.projectId() == null || input.title() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String title = input.title().trim();
        String detail = input.detail() == null || input.detail().isBlank() ? null : input.detail().trim();
        if (title.isEmpty() || title.length() > 200 || (detail != null && detail.length() > 4000)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        var location = tasks.checked(input.location());
        boolean customer = account.role().equals("CLIENTE");
        Integer reachable = customer
            ? jdbc.queryForObject("SELECT count(*) FROM sti.project WHERE id = ? AND client_id = ?", Integer.class,
                input.projectId(), account.clientId())
            : jdbc.queryForObject("SELECT count(*) FROM sti.project WHERE id = ?", Integer.class, input.projectId());
        if (reachable == null || reachable == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);

        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO sti.task (id, project_id, title, detail, status, created_by) VALUES (?,?,?,?,'POR_HACER',?)",
            id, input.projectId(), title, detail, account.id());
        if (account.role().equals("USUARIO")) {
            jdbc.update("INSERT INTO sti.task_assignment (task_id, user_id) VALUES (?,?)", id, account.id());
            tasks.event(id, "ASIGNADA", null, null, account.id(), account.id(), null);
        }
        tasks.event(id, "CREADA", null, "POR_HACER", account.id(), null, location);
        return tasks.require(id, account);
    }

    @PostMapping("/api/tasks/{id}/assignments")
    @Transactional
    Tasks.Task assign(@PathVariable UUID id, @RequestBody NewAssignment input, Principal principal) {
        var account = accounts.active(principal.getName());
        if (input == null || input.userId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var task = tasks.require(id, account);
        if (!OPERATORS.contains(account.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!OPEN.contains(task.status())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        Integer assignable = jdbc.queryForObject(
            "SELECT count(*) FROM sti.app_user WHERE id = ? AND enabled AND role <> 'CLIENTE'", Integer.class, input.userId());
        if (assignable == null || assignable == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        int added = jdbc.update("INSERT INTO sti.task_assignment (task_id, user_id) VALUES (?,?) ON CONFLICT DO NOTHING",
            id, input.userId());
        if (added > 0) tasks.event(id, "ASIGNADA", null, null, account.id(), input.userId(), null);
        return tasks.require(id, account);
    }

    @DeleteMapping("/api/tasks/{id}/assignments/{userId}")
    @Transactional
    Tasks.Task unassign(@PathVariable UUID id, @PathVariable UUID userId, Principal principal) {
        var account = accounts.active(principal.getName());
        var task = tasks.require(id, account);
        if (!OPERATORS.contains(account.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!OPEN.contains(task.status())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        int removed = jdbc.update("DELETE FROM sti.task_assignment WHERE task_id = ? AND user_id = ?", id, userId);
        if (removed > 0) tasks.event(id, "DESASIGNADA", null, null, account.id(), userId, null);
        return tasks.require(id, account);
    }

    /**
     * FINALIZADO is never requested here: it is reached when every assignee confirms. FACTURADO needs a client
     * signature, which belongs to the next slice. Moving a task backwards clears every confirmation.
     */
    @PostMapping("/api/tasks/{id}/status")
    @Transactional
    Tasks.Task status(@PathVariable UUID id, @RequestBody StatusChange input, Principal principal) {
        var account = accounts.active(principal.getName());
        if (input == null || input.to() == null || !REQUESTABLE.contains(input.to())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        var location = tasks.checked(input.location());
        var task = tasks.require(id, account);
        String from = task.status();
        String to = input.to();
        if (!OPEN.contains(from) && !from.equals("FINALIZADO")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        boolean operator = OPERATORS.contains(account.role());
        boolean assigned = task.assignees().stream().anyMatch(assignee -> assignee.id().equals(account.id()));
        boolean backwards = to.equals("POR_HACER") || (to.equals("EN_PROCESO") && from.equals("FINALIZADO"));
        if (to.equals("ANULADA")) {
            if (!account.role().equals("ADMIN")) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        } else if (backwards) {
            if (!operator) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        } else if (!operator && !(assigned && account.role().equals("USUARIO"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (to.equals(from)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (backwards) jdbc.update("UPDATE sti.task_assignment SET confirmed_at = NULL WHERE task_id = ?", id);
        jdbc.update("UPDATE sti.task SET status = ? WHERE id = ?", to, id);
        tasks.event(id, "ESTADO", from, to, account.id(), null, location);
        return tasks.require(id, account);
    }

    /** Each assignee confirms its own completion; the last pending confirmation finishes the task. */
    @PostMapping("/api/tasks/{id}/confirmations")
    @Transactional
    Tasks.Task confirm(@PathVariable UUID id, @RequestBody Confirmation input, Principal principal) {
        var account = accounts.active(principal.getName());
        if (input == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var location = tasks.checked(input.location());
        var task = tasks.require(id, account);
        if (!task.status().equals("EN_PROCESO")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (task.assignees().stream().noneMatch(assignee -> assignee.id().equals(account.id()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        int confirmed = jdbc.update(
            "UPDATE sti.task_assignment SET confirmed_at = now() WHERE task_id = ? AND user_id = ? AND confirmed_at IS NULL",
            id, account.id());
        if (confirmed == 0) return task;
        tasks.event(id, "CONFIRMACION", "EN_PROCESO", null, account.id(), account.id(), location);
        Integer pending = jdbc.queryForObject(
            "SELECT count(*) FROM sti.task_assignment WHERE task_id = ? AND confirmed_at IS NULL", Integer.class, id);
        if (pending != null && pending == 0) {
            jdbc.update("UPDATE sti.task SET status = 'FINALIZADO' WHERE id = ?", id);
            tasks.event(id, "ESTADO", "EN_PROCESO", "FINALIZADO", account.id(), null, location);
        }
        return tasks.require(id, account);
    }
}
