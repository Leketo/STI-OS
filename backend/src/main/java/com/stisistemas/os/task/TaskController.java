package com.stisistemas.os.task;

import com.stisistemas.os.identity.Accounts;
import java.io.IOException;
import java.security.Principal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.multipart.MultipartFile;
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
    private static final Set<String> REQUESTABLE = Set.of("POR_HACER", "EN_PROCESO", "FACTURADO", "ANULADA");
    private static final Set<String> OPEN = Set.of("POR_HACER", "EN_PROCESO");
    private static final int MAX_PHOTOS = 5;
    private final JdbcTemplate jdbc;
    private final Accounts accounts;
    private final Tasks tasks;
    private final Uploads uploads;

    public TaskController(JdbcTemplate jdbc, Accounts accounts, Tasks tasks, Uploads uploads) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.tasks = tasks;
        this.uploads = uploads;
    }

    record Operator(UUID id, String name, String role) {}
    record NewTask(UUID projectId, String title, String detail, Tasks.Location location) {}
    record NewAssignment(UUID userId) {}
    record StatusChange(String to, Tasks.Location location) {}
    record Confirmation(Tasks.Location location) {}
    record NewSignature(String signerName, String signedOn, String image, Tasks.Location location) {}

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
        if (to.equals("FACTURADO")) {
            if (!account.role().equals("ADMIN")) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
            if (!from.equals("FINALIZADO") || !task.signed()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (backwards) {
            jdbc.update("UPDATE sti.task_assignment SET confirmed_at = NULL WHERE task_id = ?", id);
            // A reopened task must be signed again; the previous signature stays as evidence.
            jdbc.update("UPDATE sti.task_signature SET superseded_at = clock_timestamp() WHERE task_id = ? AND superseded_at IS NULL", id);
        }
        jdbc.update("UPDATE sti.task SET status = ? WHERE id = ?", to, id);
        tasks.event(id, "ESTADO", from, to, account.id(), null, location);
        return tasks.require(id, account);
    }

    @PostMapping("/api/tasks/{id}/photos")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    Tasks.Photo addPhoto(@PathVariable UUID id, @RequestParam("file") MultipartFile file, Principal principal) {
        var account = accounts.active(principal.getName());
        var task = tasks.require(id, account);
        if (!OPEN.contains(task.status())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (!mayAttach(account, task)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (task.photoCount() >= MAX_PHOTOS) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        byte[] bytes = read(file);
        if (bytes.length == 0 || bytes.length > Uploads.MAX_PHOTO_BYTES) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String contentType = Uploads.imageType(bytes);
        if (contentType == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        UUID photo = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO sti.task_photo (id, task_id, storage_name, content_type, byte_size, uploaded_by)
            VALUES (?,?,?,?,?,?)""",
            photo, id, uploads.store(bytes, contentType), contentType, bytes.length, account.id());
        return tasks.photos(id).stream().filter(stored -> stored.id().equals(photo)).findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR));
    }

    @GetMapping("/api/tasks/{id}/photos/{photoId}")
    ResponseEntity<byte[]> photo(@PathVariable UUID id, @PathVariable UUID photoId, Principal principal) {
        var account = accounts.active(principal.getName());
        tasks.require(id, account);
        var stored = jdbc.query("SELECT storage_name, content_type FROM sti.task_photo WHERE id = ? AND task_id = ?",
            (rs, n) -> Map.entry(rs.getString("storage_name"), rs.getString("content_type")), photoId, id)
            .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return bytes(uploads.read(stored.getKey()), stored.getValue());
    }

    @GetMapping("/api/tasks/{id}/signature")
    ResponseEntity<byte[]> signature(@PathVariable UUID id, @RequestParam(required = false) UUID signatureId,
                                     Principal principal) {
        var account = accounts.active(principal.getName());
        tasks.require(id, account);
        String sql = "SELECT storage_name FROM sti.task_signature WHERE task_id = ?"
            + (signatureId == null ? " AND superseded_at IS NULL" : " AND id = ?");
        Object[] parameters = signatureId == null ? new Object[]{id} : new Object[]{id, signatureId};
        String name = jdbc.query(sql, (rs, n) -> rs.getString("storage_name"), parameters)
            .stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return bytes(uploads.read(name), "image/png");
    }

    /**
     * Conformity with finished work. Face to face the operator presents the task on its own device and the signer
     * never logs in; remotely the company's CLIENTE signs from its own account. Both record the session account.
     */
    @PostMapping("/api/tasks/{id}/signature")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    Tasks.Signature sign(@PathVariable UUID id, @RequestBody NewSignature input, Principal principal) {
        var account = accounts.active(principal.getName());
        if (input == null || input.signerName() == null || input.image() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String signer = input.signerName().trim();
        if (signer.isEmpty() || signer.length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        LocalDate signedOn = signedOn(input.signedOn());
        var location = tasks.checked(input.location());
        var task = tasks.require(id, account);
        if (!task.status().equals("FINALIZADO")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        boolean remote = account.role().equals("CLIENTE");
        boolean presenter = remote || OPERATORS.contains(account.role())
            || task.assignees().stream().anyMatch(assignee -> assignee.id().equals(account.id()));
        if (!presenter) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (task.signed()) throw new ResponseStatusException(HttpStatus.CONFLICT);

        byte[] stroke = decode(input.image());
        if (stroke.length == 0 || stroke.length > Uploads.MAX_SIGNATURE_BYTES
            || !"image/png".equals(Uploads.imageType(stroke))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        UUID signature = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO sti.task_signature (id, task_id, storage_name, byte_size, signer_name, signed_on,
                                            presented_by, remote, latitude, longitude, accuracy_m, location_absent_reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            signature, id, uploads.store(stroke, "image/png"), stroke.length, signer, signedOn, account.id(), remote,
            location.latitude(), location.longitude(), location.accuracyM(), location.absentReason());
        tasks.event(id, "FIRMA", null, null, account.id(), null, location);
        return tasks.signatures(id).stream().filter(stored -> stored.id().equals(signature)).findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR));
    }

    /** The company's CLIENTE may document its own request; assignees and operators document the work. */
    private boolean mayAttach(Accounts.Account account, Tasks.Task task) {
        return OPERATORS.contains(account.role()) || account.role().equals("CLIENTE")
            || task.assignees().stream().anyMatch(assignee -> assignee.id().equals(account.id()));
    }

    private static ResponseEntity<byte[]> bytes(byte[] content, String contentType) {
        return ResponseEntity.ok().header("Content-Type", contentType).header("Cache-Control", "no-store")
            .header("Content-Disposition", "inline").body(content);
    }

    private static byte[] read(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        try {
            return file.getBytes();
        } catch (IOException failure) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
    }

    private static byte[] decode(String image) {
        String payload = image.contains(",") ? image.substring(image.indexOf(',') + 1) : image;
        try {
            return Base64.getDecoder().decode(payload.trim());
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
    }

    private static LocalDate signedOn(String value) {
        if (value == null || value.isBlank()) return LocalDate.now();
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
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
