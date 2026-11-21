package com.stisistemas.os.task;

import com.stisistemas.os.Refusal;

import com.stisistemas.os.identity.Accounts;
import java.io.IOException;
import java.security.Principal;
import java.time.LocalDate;
import java.time.ZoneId;
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
    private static final Set<String> REQUESTABLE =
        Set.of("POR_HACER", "EN_PROCESO", "FINALIZADO", "FACTURADO", "NO_FACTURABLE", "ANULADA");
    /** R-23: the two ways a finished task closes. */
    private static final Set<String> CLOSED = Set.of("FACTURADO", "NO_FACTURABLE");
    private static final Set<String> OPEN = Set.of("POR_HACER", "EN_PROCESO");
    private static final int MAX_PHOTOS = 5;
    private static final ZoneId PARAGUAY = ZoneId.of("America/Asuncion");
    /** Kept in the status event of rule 2; the unassignment request carries no location. */
    /** D-263: a change of the scheduled day asks for no location; the log records why it has none. */
    static final String SCHEDULE_CHANGE = "No aplica: cambio de fecha";
    static final String FINISHED_BY_UNASSIGNING =
        "Finalizada al quitar a la única persona pendiente: las demás ya habían confirmado. La desasignación no registra ubicación.";
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

    record Operator(UUID id, String name, String role, boolean active) {}
    /** Corte 3B (R-10, R-10b): ADMIN and SUPERVISOR may assign people and the day at creation. */
    record NewTask(UUID projectId, String title, String detail, Tasks.Location location, List<UUID> assignees,
                   java.time.LocalDate scheduledOn) {}
    record NewAssignment(UUID userId, java.time.LocalDate scheduledOn) {}
    record ScheduleChange(java.time.LocalDate scheduledOn) {}
    record StatusChange(String to, Tasks.Location location, String reason) {}
    record Confirmation(Tasks.Location location) {}
    record NewSignature(String signerName, String signedOn, String image, Tasks.Location location) {}

    @GetMapping("/api/operators")
    List<Operator> operators(@RequestParam(defaultValue = "false") boolean includeInactive, Principal principal) {
        var account = accounts.active(principal.getName());
        if (!OPERATORS.contains(account.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        // Only active people are offered for assignment (rule 5). The ADMIN may also list the inactive ones, to
        // filter the board by a person whose tasks were kept (D-86).
        if (includeInactive && !account.role().equals("ADMIN")) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return jdbc.query("SELECT id, display_name, role, enabled FROM sti.app_user WHERE role <> 'CLIENTE'"
                + (includeInactive ? "" : " AND enabled") + " ORDER BY display_name, id",
            (rs, n) -> new Operator(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("role"),
                rs.getBoolean("enabled")));
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
        boolean operator = OPERATORS.contains(account.role());
        boolean assigning = input.assignees() != null && !input.assignees().isEmpty();
        // Point 3: the customer (and the technician, who is assigned by rule) never sends people or a day.
        if (!operator && (input.assignees() != null || input.scheduledOn() != null)) {
            throw new Refusal(HttpStatus.FORBIDDEN, "ASIGNACION_NO_PERMITIDA",
                "Solo un supervisor o un administrador asigna responsables y fecha.");
        }
        if (operator && assigning && input.scheduledOn() == null) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "FECHA_OBLIGATORIA",
                "Con responsables, la fecha de asignación es obligatoria.");
        }
        if (input.scheduledOn() != null) checkScheduleRange(input.scheduledOn());
        List<UUID> people = assigning ? input.assignees().stream().distinct().toList() : List.of();
        for (UUID person : people) {
            if (person == null || !assignable(person)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        Integer reachable = customer
            ? jdbc.queryForObject("SELECT count(*) FROM sti.project WHERE id = ? AND client_id = ?", Integer.class,
                input.projectId(), account.clientId())
            : jdbc.queryForObject("SELECT count(*) FROM sti.project WHERE id = ?", Integer.class, input.projectId());
        if (reachable == null || reachable == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);

        UUID id = UUID.randomUUID();
        // D-252: a task the technician creates is assigned to them for today, Paraguay's day.
        java.time.LocalDate day = account.role().equals("USUARIO") ? today() : input.scheduledOn();
        jdbc.update("INSERT INTO sti.task (id, project_id, title, detail, status, created_by, scheduled_on) "
            + "VALUES (?,?,?,?,'POR_HACER',?,?)", id, input.projectId(), title, detail, account.id(), day);
        if (account.role().equals("USUARIO")) {
            jdbc.update("INSERT INTO sti.task_assignment (task_id, user_id) VALUES (?,?)", id, account.id());
            tasks.event(id, "ASIGNADA", null, null, account.id(), account.id(), null, null, null, day);
        }
        tasks.event(id, "CREADA", null, "POR_HACER", account.id(), null, location);
        for (UUID person : people) {
            jdbc.update("INSERT INTO sti.task_assignment (task_id, user_id) VALUES (?,?)", id, person);
            tasks.event(id, "ASIGNADA", null, null, account.id(), person, null, null, null, day);
        }
        return tasks.require(id, account);
    }

    @PostMapping("/api/tasks/{id}/assignments")
    @Transactional
    Tasks.Task assign(@PathVariable UUID id, @RequestBody NewAssignment input, Principal principal) {
        var account = accounts.active(principal.getName());
        if (input == null || input.userId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        tasks.lock(id);
        var task = tasks.require(id, account);
        if (!OPERATORS.contains(account.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!OPEN.contains(task.status())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (!assignable(input.userId())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        // Point 5 (R-10): a task without a day gets one before anyone is assigned; one that has a day keeps it, and
        // a different day goes through "Cambiar fecha", where the change is logged.
        java.time.LocalDate day = task.scheduledOn();
        if (day == null) {
            if (input.scheduledOn() == null) {
                throw new Refusal(HttpStatus.BAD_REQUEST, "FECHA_OBLIGATORIA",
                    "Esta tarea todavía no tiene fecha de asignación. Elegí el día para poder asignarla.");
            }
            checkScheduleRange(input.scheduledOn());
            day = input.scheduledOn();
        } else if (input.scheduledOn() != null && !input.scheduledOn().equals(day)) {
            throw new TaskConflict("FECHA_DISTINTA",
                "La tarea ya tiene fecha de asignación. Para cambiarla usá \"Cambiar fecha\".");
        }
        int added = jdbc.update("INSERT INTO sti.task_assignment (task_id, user_id) VALUES (?,?) ON CONFLICT DO NOTHING",
            id, input.userId());
        if (added > 0) {
            jdbc.update("UPDATE sti.task SET scheduled_on = ? WHERE id = ?", day, id);
            tasks.event(id, "ASIGNADA", null, null, account.id(), input.userId(), null, null, null, day);
        }
        return tasks.require(id, account);
    }

    /**
     * Corte 3B (R-10, D-259): ADMIN and SUPERVISOR set or change the day, only while the task is open. The log keeps
     * the previous day and the new one; no location is asked for (D-263).
     */
    @PostMapping("/api/tasks/{id}/schedule")
    @Transactional
    Tasks.Task schedule(@PathVariable UUID id, @RequestBody ScheduleChange input, Principal principal) {
        var account = accounts.active(principal.getName());
        tasks.lock(id);
        var task = tasks.require(id, account);
        if (!OPERATORS.contains(account.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (input == null || input.scheduledOn() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (!OPEN.contains(task.status())) {
            throw new TaskConflict("FECHA_NO_EDITABLE",
                "La fecha de asignación se cambia solo en Por hacer y En proceso.");
        }
        checkScheduleRange(input.scheduledOn());
        if (input.scheduledOn().equals(task.scheduledOn())) return task;
        jdbc.update("UPDATE sti.task SET scheduled_on = ? WHERE id = ?", input.scheduledOn(), id);
        tasks.event(id, "FECHA", null, null, account.id(), null, new Tasks.Location(null, null, null, SCHEDULE_CHANGE),
            null, task.scheduledOn(), input.scheduledOn());
        return tasks.require(id, account);
    }

    /** D-264: from five years back to five years ahead of today in Paraguay. */
    private static void checkScheduleRange(java.time.LocalDate day) {
        java.time.LocalDate today = today();
        if (day.isBefore(today.minusYears(5)) || day.isAfter(today.plusYears(5))) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "FECHA_FUERA_DE_RANGO",
                "La fecha de asignación tiene que estar entre 5 años atrás y 5 años adelante.");
        }
    }

    /** D-252: "hoy" is the day in Paraguay. */
    static java.time.LocalDate today() { return java.time.LocalDate.now(PARAGUAY); }

    /** D-198: an active internal account. */
    private boolean assignable(UUID userId) {
        Integer found = jdbc.queryForObject(
            "SELECT count(*) FROM sti.app_user WHERE id = ? AND enabled AND role <> 'CLIENTE'", Integer.class, userId);
        return found != null && found > 0;
    }

    @DeleteMapping("/api/tasks/{id}/assignments/{userId}")
    @Transactional
    Tasks.Task unassign(@PathVariable UUID id, @PathVariable UUID userId, Principal principal) {
        var account = accounts.active(principal.getName());
        tasks.lock(id);
        var task = tasks.require(id, account);
        if (!OPERATORS.contains(account.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!OPEN.contains(task.status())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var removed = task.assignees().stream().filter(assignee -> assignee.id().equals(userId)).findFirst();
        if (removed.isEmpty()) return task;
        boolean working = task.status().equals("EN_PROCESO");
        // Rule 3 (D-26): a task in progress always keeps someone who can finish it.
        if (working && task.assignees().size() == 1) {
            throw new TaskConflict("ULTIMO_ASIGNADO", "No se puede quitar a la última persona asignada de una tarea en proceso. "
                + "Asigná a otra persona antes, o volvé la tarea a Por hacer.");
        }
        jdbc.update("DELETE FROM sti.task_assignment WHERE task_id = ? AND user_id = ?", id, userId);
        tasks.event(id, "DESASIGNADA", null, null, account.id(), userId, null);
        // Rule 2 (D-26): removing the only one still pending finishes the task. The status event names who caused
        // it (actor), whose removal did (subject) and why, in the reason the log keeps when a step has no location.
        boolean othersConfirmed = task.assignees().stream()
            .filter(assignee -> !assignee.id().equals(userId)).allMatch(Tasks.Assignee::confirmed);
        if (working && !removed.get().confirmed() && othersConfirmed) {
            jdbc.update("UPDATE sti.task SET status = 'FINALIZADO' WHERE id = ?", id);
            tasks.event(id, "ESTADO", "EN_PROCESO", "FINALIZADO", account.id(), userId,
                new Tasks.Location(null, null, null, FINISHED_BY_UNASSIGNING));
        }
        return tasks.require(id, account);
    }

    /**
     * FINALIZADO is reached when every assignee confirms; it is requested here only to bring a closed task back
     * ("Volver a Finalizadas", D-209), which keeps confirmations and signature. A finished task closes as FACTURADO
     * (needs a current signature) or NO_FACTURABLE (needs a reason, no signature), both by ADMIN or SUPERVISOR
     * (R-23, D-207). Moving an open or finished task backwards clears every confirmation.
     */
    @PostMapping("/api/tasks/{id}/status")
    @Transactional
    Tasks.Task status(@PathVariable UUID id, @RequestBody StatusChange input, Principal principal) {
        var account = accounts.active(principal.getName());
        if (input == null || input.to() == null || !REQUESTABLE.contains(input.to())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String reason = input.reason() == null || input.reason().isBlank() ? null : input.reason().trim();
        if (input.to().equals("NO_FACTURABLE") ? reason == null || !Tasks.CLOSING_REASONS.contains(reason) : reason != null) {
            throw new com.stisistemas.os.Refusal(HttpStatus.BAD_REQUEST, "MOTIVO_INVALIDO", "Elegí el motivo: Uso interno o Garantía.");
        }
        var location = tasks.checked(input.location());
        tasks.lock(id);
        var task = tasks.require(id, account);
        String from = task.status();
        String to = input.to();
        boolean closing = CLOSED.contains(to);
        boolean reopening = to.equals("FINALIZADO");
        if (closing || reopening) {
            // Nobody asks for FINALIZADO on an open task: it is reached by confirming. A state rule, 400 for anyone,
            // as it answered until v0.2.1; only "Volver a Finalizadas" asks for it.
            if (reopening && !CLOSED.contains(from) && !from.equals("FINALIZADO")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            if (!OPERATORS.contains(account.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
            // Under the task lock: when two people close (or bring back) the same task at once, the second one
            // finds it already moved and is told so (rule 8 of R-23).
            if (closing && CLOSED.contains(from)) {
                throw new TaskConflict("YA_CERRADA", "Otra persona ya cerró esta tarea como "
                    + (from.equals("FACTURADO") ? "facturada" : "no facturable") + ". Actualizá para ver cómo quedó.");
            }
            if (reopening && from.equals("FINALIZADO")) {
                throw new TaskConflict("YA_FINALIZADA", "Otra persona ya la volvió a Finalizadas. Actualizá para ver cómo quedó.");
            }
            if (closing && !from.equals("FINALIZADO")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            if (to.equals("FACTURADO") && !task.signed()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            // "Volver a Finalizadas" keeps confirmations and signature and clears the reason; the log keeps it.
            jdbc.update("UPDATE sti.task SET status = ?, closing_reason = ? WHERE id = ?", to, reason, id);
            tasks.event(id, "ESTADO", from, to, account.id(), null, location, reason);
            return tasks.require(id, account);
        }
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
        // Rule 1 (D-26): nobody could ever confirm a task started without assignees.
        if (to.equals("EN_PROCESO") && task.assignees().isEmpty()) {
            throw new TaskConflict("SIN_ASIGNADOS", "No se puede iniciar una tarea sin personas asignadas. Asigná al menos una antes de iniciarla.");
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
        tasks.lock(id);
        var task = tasks.require(id, account);
        if (!OPEN.contains(task.status())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (!mayAttach(account, task)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        // Distinct statuses so the interface can say what is actually wrong instead of a generic rejection.
        // Counted under the task lock: simultaneous uploads see each other's rows.
        if (task.photoCount() >= MAX_PHOTOS) {
            throw new TaskConflict("MAXIMO_FOTOS", "La tarea ya tiene cinco fotos, el máximo permitido.");
        }
        byte[] bytes = read(file);
        if (bytes.length > Uploads.MAX_PHOTO_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        String contentType = Uploads.imageType(bytes);
        if (contentType == null) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        UUID photo = UUID.randomUUID();
        String storage = Uploads.name(contentType);
        jdbc.update("""
            INSERT INTO sti.task_photo (id, task_id, storage_name, content_type, byte_size, uploaded_by)
            VALUES (?,?,?,?,?,?)""",
            photo, id, storage, contentType, bytes.length, account.id());
        uploads.write(storage, bytes);
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
        tasks.lock(id);
        var task = tasks.require(id, account);
        if (!task.status().equals("FINALIZADO")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        boolean remote = account.role().equals("CLIENTE");
        boolean presenter = remote || OPERATORS.contains(account.role())
            || task.assignees().stream().anyMatch(assignee -> assignee.id().equals(account.id()));
        if (!presenter) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (task.signed()) {
            throw new TaskConflict("FIRMA_VIGENTE", "La tarea ya tiene una firma vigente. Para firmar de nuevo hay que reabrirla.");
        }

        byte[] stroke = decode(input.image());
        if (stroke.length == 0 || stroke.length > Uploads.MAX_SIGNATURE_BYTES
            || !"image/png".equals(Uploads.imageType(stroke))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        UUID signature = UUID.randomUUID();
        String storage = Uploads.name("image/png");
        jdbc.update("""
            INSERT INTO sti.task_signature (id, task_id, storage_name, byte_size, signer_name, signed_on,
                                            presented_by, remote, latitude, longitude, accuracy_m, location_absent_reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            signature, id, storage, stroke.length, signer, signedOn, account.id(), remote,
            location.latitude(), location.longitude(), location.accuracyM(), location.absentReason());
        uploads.write(storage, stroke);
        tasks.event(id, "FIRMA", null, null, account.id(), null, location);
        return tasks.signatures(id).stream().filter(stored -> stored.id().equals(signature)).findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR));
    }

    /** The company's CLIENTE may document its own request; assignees and operators document the work. */
    private boolean mayAttach(Accounts.Account account, Tasks.Task task) {
        return OPERATORS.contains(account.role()) || account.role().equals("CLIENTE")
            || task.assignees().stream().anyMatch(assignee -> assignee.id().equals(account.id()));
    }

    private static final Set<String> WITH_CONSTANCIA = Set.of("FINALIZADO", "FACTURADO", "NO_FACTURABLE");

    /**
     * Corte 3A (R-21): the service record in PDF. ADMIN and SUPERVISOR always; the CLIENTE on the tasks it sees
     * (closed ones it does not, rule 6 of R-23); never the technician. Made on demand, never kept, never cached.
     */
    @GetMapping("/api/tasks/{id}/constancia")
    ResponseEntity<byte[]> constancia(@PathVariable UUID id, Principal principal) {
        var account = accounts.active(principal.getName());
        if (account.role().equals("USUARIO")) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        var task = tasks.require(id, account);
        if (!WITH_CONSTANCIA.contains(task.status())) {
            throw new TaskConflict("SIN_CONSTANCIA", "La constancia se puede descargar cuando la tarea está finalizada.");
        }
        String client = jdbc.queryForObject("SELECT c.name FROM sti.client c WHERE c.id = ?", String.class, task.clientId());
        String project = jdbc.queryForObject("SELECT p.name FROM sti.project p WHERE p.id = ?", String.class, task.projectId());
        // Atención: the first move to EN_PROCESO. Finalizada: the last time the work finished; a return from a closed
        // state ("Volver a Finalizadas") is not the work finishing, so it does not count.
        var attended = jdbc.queryForObject("SELECT min(occurred_at) FROM sti.task_event WHERE task_id = ? AND kind = 'ESTADO' "
            + "AND to_status = 'EN_PROCESO'", java.time.OffsetDateTime.class, id);
        var finished = jdbc.queryForObject("SELECT max(occurred_at) FROM sti.task_event WHERE task_id = ? AND kind = 'ESTADO' "
            + "AND to_status = 'FINALIZADO' AND from_status IS DISTINCT FROM 'FACTURADO' AND from_status IS DISTINCT FROM 'NO_FACTURABLE'",
            java.time.OffsetDateTime.class, id);
        var signature = jdbc.query("SELECT storage_name, signer_name, signed_at, remote FROM sti.task_signature "
                + "WHERE task_id = ? AND superseded_at IS NULL",
            (rs, n) -> new Constancia.Signature(uploads.read(rs.getString("storage_name")), rs.getString("signer_name"),
                rs.getObject("signed_at", java.time.OffsetDateTime.class), rs.getBoolean("remote")), id)
            .stream().findFirst().orElse(null);
        var data = new Constancia.Data(task.code(), client, project, task.title(),
            task.assignees().stream().map(Tasks.Assignee::name).toList(), task.createdAt(), attended, finished, signature);
        byte[] pdf = Constancia.render(data, java.time.Instant.now());
        return ResponseEntity.ok().header("Content-Type", "application/pdf").header("Cache-Control", "no-store")
            .header("Content-Disposition", "attachment; filename=\"" + Constancia.fileName(task.code()) + "\"").body(pdf);
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
        // Without a date from the device, the day in Paraguay, never the server's zone (N-16).
        if (value == null || value.isBlank()) return LocalDate.now(PARAGUAY);
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
        // Without the lock two last confirmations each counted the other as pending and none finished the task (N-11).
        tasks.lock(id);
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
