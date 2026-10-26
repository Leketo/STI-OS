package com.stisistemas.os.task;

import com.stisistemas.os.identity.Accounts.Account;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Task reads, visibility rules and the traceability log shared by the task endpoints. */
@Service
public class Tasks {
    public static final Set<String> STATUSES = Set.of("POR_HACER", "EN_PROCESO", "FINALIZADO", "FACTURADO", "ANULADA");
    private static final String SELECT = """
        SELECT t.id, t.number, t.project_id, p.client_id, t.title, t.detail, t.status, t.created_at,
               (SELECT count(*) FROM sti.task_photo ph WHERE ph.task_id = t.id) AS photo_count,
               EXISTS (SELECT 1 FROM sti.task_signature s WHERE s.task_id = t.id AND s.superseded_at IS NULL) AS signed
        FROM sti.task t JOIN sti.project p ON p.id = t.project_id WHERE true""";
    private final JdbcTemplate jdbc;

    public Tasks(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Location(Double latitude, Double longitude, Double accuracyM, String absentReason) {}
    public record Assignee(UUID id, String name, boolean confirmed) {}
    public record Task(UUID id, String code, UUID projectId, UUID clientId, String title, String detail, String status,
                       OffsetDateTime createdAt, List<Assignee> assignees, int confirmed, int pending,
                       int photoCount, boolean signed) {}
    public record Event(UUID id, String kind, String fromStatus, String toStatus, UUID actorId, String actorName,
                        UUID subjectId, OffsetDateTime occurredAt, Double latitude, Double longitude, Double accuracyM,
                        String locationAbsentReason) {}
    public record Photo(UUID id, String contentType, int byteSize, OffsetDateTime uploadedAt, String uploadedBy) {}
    public record Signature(UUID id, String signerName, LocalDate signedOn, OffsetDateTime signedAt, String presentedBy,
                            boolean remote, boolean current, Double latitude, Double longitude, Double accuracyM,
                            String locationAbsentReason) {}
    public record Detail(UUID id, String code, UUID projectId, UUID clientId, String title, String detail, String status,
                         OffsetDateTime createdAt, List<Assignee> assignees, int confirmed, int pending,
                         int photoCount, boolean signed, List<Event> events, List<Photo> photos,
                         List<Signature> signatures) {}

    /**
     * GPS is required at every defined step, but a device that cannot obtain a fix records the reason instead of
     * losing the step. Exactly one of the two forms must arrive.
     */
    public Location checked(Location location) {
        boolean coordinates = location != null && location.latitude() != null && location.longitude() != null;
        boolean absent = location != null && location.absentReason() != null && !location.absentReason().isBlank();
        if (coordinates == absent) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        if (coordinates && (Math.abs(location.latitude()) > 90 || Math.abs(location.longitude()) > 180
            || (location.accuracyM() != null && location.accuracyM() < 0))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (absent) {
            String reason = location.absentReason().trim();
            if (reason.length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
            return new Location(null, null, null, reason);
        }
        return new Location(location.latitude(), location.longitude(), location.accuracyM(), null);
    }

    public List<Task> list(Account account, UUID projectId, String status) {
        if (status != null && !STATUSES.contains(status)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        boolean cancelled = "ANULADA".equals(status);
        if (cancelled && !account.role().equals("ADMIN")) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        var sql = new StringBuilder(SELECT);
        List<Object> parameters = new ArrayList<>();
        visibility(account, sql, parameters);
        if (!cancelled) sql.append(" AND t.status <> 'ANULADA'");
        if (status != null) { sql.append(" AND t.status = ?"); parameters.add(status); }
        if (projectId != null) { sql.append(" AND t.project_id = ?"); parameters.add(projectId); }
        sql.append(" ORDER BY t.number DESC LIMIT 200");
        return withAssignees(jdbc.query(sql.toString(), Tasks::row, parameters.toArray()));
    }

    /** The visible task or 404; a task outside the account's reach is indistinguishable from a missing one. */
    public Task require(UUID id, Account account) {
        var sql = new StringBuilder(SELECT).append(" AND t.id = ?");
        List<Object> parameters = new ArrayList<>();
        parameters.add(id);
        visibility(account, sql, parameters);
        var found = withAssignees(jdbc.query(sql.toString(), Tasks::row, parameters.toArray()));
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return found.get(0);
    }

    public Detail detail(UUID id, Account account) {
        Task task = require(id, account);
        return new Detail(task.id(), task.code(), task.projectId(), task.clientId(), task.title(), task.detail(),
            task.status(), task.createdAt(), task.assignees(), task.confirmed(), task.pending(), task.photoCount(),
            task.signed(), events(id), photos(id), signatures(id));
    }

    public List<Photo> photos(UUID taskId) {
        return jdbc.query("""
            SELECT p.id, p.content_type, p.byte_size, p.uploaded_at, u.display_name
            FROM sti.task_photo p JOIN sti.app_user u ON u.id = p.uploaded_by
            WHERE p.task_id = ? ORDER BY p.uploaded_at, p.id""",
            (rs, n) -> new Photo(rs.getObject("id", UUID.class), rs.getString("content_type"), rs.getInt("byte_size"),
                rs.getObject("uploaded_at", OffsetDateTime.class), rs.getString("display_name")), taskId);
    }

    public List<Signature> signatures(UUID taskId) {
        return jdbc.query("""
            SELECT s.id, s.signer_name, s.signed_on, s.signed_at, s.remote, s.superseded_at, u.display_name,
                   s.latitude, s.longitude, s.accuracy_m, s.location_absent_reason
            FROM sti.task_signature s JOIN sti.app_user u ON u.id = s.presented_by
            WHERE s.task_id = ? ORDER BY s.signed_at DESC""",
            (rs, n) -> new Signature(rs.getObject("id", UUID.class), rs.getString("signer_name"),
                rs.getObject("signed_on", LocalDate.class), rs.getObject("signed_at", OffsetDateTime.class),
                rs.getString("display_name"), rs.getBoolean("remote"), rs.getObject("superseded_at") == null,
                number(rs, "latitude"), number(rs, "longitude"), number(rs, "accuracy_m"),
                rs.getString("location_absent_reason")), taskId);
    }

    public void event(UUID taskId, String kind, String from, String to, UUID actor, UUID subject, Location location) {
        jdbc.update("""
            INSERT INTO sti.task_event (id, task_id, kind, from_status, to_status, actor_id, subject_id,
                                        latitude, longitude, accuracy_m, location_absent_reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            UUID.randomUUID(), taskId, kind, from, to, actor, subject,
            location == null ? null : location.latitude(), location == null ? null : location.longitude(),
            location == null ? null : location.accuracyM(), location == null ? null : location.absentReason());
    }

    private void visibility(Account account, StringBuilder sql, List<Object> parameters) {
        switch (account.role()) {
            case "ADMIN" -> { }
            case "SUPERVISOR" -> sql.append(" AND t.status <> 'ANULADA'");
            case "USUARIO" -> {
                sql.append(" AND t.status NOT IN ('FACTURADO','ANULADA')")
                   .append(" AND EXISTS (SELECT 1 FROM sti.task_assignment a WHERE a.task_id = t.id AND a.user_id = ?)");
                parameters.add(account.id());
            }
            default -> {
                sql.append(" AND t.status NOT IN ('FACTURADO','ANULADA') AND p.client_id = ?");
                parameters.add(account.clientId());
            }
        }
    }

    private List<Task> withAssignees(List<Task> tasks) {
        if (tasks.isEmpty()) return tasks;
        List<UUID> ids = tasks.stream().map(Task::id).toList();
        String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(","));
        record Row(UUID taskId, Assignee assignee) {}
        Map<UUID, List<Assignee>> byTask = jdbc.query("""
            SELECT a.task_id, u.id, u.display_name, a.confirmed_at FROM sti.task_assignment a
            JOIN sti.app_user u ON u.id = a.user_id WHERE a.task_id IN (%s) ORDER BY u.display_name, u.id
            """.formatted(placeholders),
            (rs, n) -> new Row(rs.getObject("task_id", UUID.class), new Assignee(rs.getObject("id", UUID.class),
                rs.getString("display_name"), rs.getObject("confirmed_at") != null)), ids.toArray())
            .stream().collect(Collectors.groupingBy(Row::taskId, Collectors.mapping(Row::assignee, Collectors.toList())));
        return tasks.stream().map(task -> {
            List<Assignee> assignees = byTask.getOrDefault(task.id(), List.of());
            int confirmed = (int) assignees.stream().filter(Assignee::confirmed).count();
            return new Task(task.id(), task.code(), task.projectId(), task.clientId(), task.title(), task.detail(),
                task.status(), task.createdAt(), assignees, confirmed, assignees.size() - confirmed,
                task.photoCount(), task.signed());
        }).toList();
    }

    private List<Event> events(UUID taskId) {
        return jdbc.query("""
            SELECT e.id, e.kind, e.from_status, e.to_status, e.actor_id, u.display_name, e.subject_id, e.occurred_at,
                   e.latitude, e.longitude, e.accuracy_m, e.location_absent_reason
            FROM sti.task_event e JOIN sti.app_user u ON u.id = e.actor_id
            WHERE e.task_id = ? ORDER BY e.occurred_at, e.id""",
            (rs, n) -> new Event(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("from_status"),
                rs.getString("to_status"), rs.getObject("actor_id", UUID.class), rs.getString("display_name"),
                rs.getObject("subject_id", UUID.class), rs.getObject("occurred_at", OffsetDateTime.class),
                number(rs, "latitude"), number(rs, "longitude"), number(rs, "accuracy_m"),
                rs.getString("location_absent_reason")), taskId);
    }

    private static Task row(ResultSet rs, int number) throws SQLException {
        return new Task(rs.getObject("id", UUID.class), code(rs.getInt("number")),
            rs.getObject("project_id", UUID.class), rs.getObject("client_id", UUID.class),
            rs.getString("title"), rs.getString("detail"), rs.getString("status"),
            rs.getObject("created_at", OffsetDateTime.class), List.of(), 0, 0,
            rs.getInt("photo_count"), rs.getBoolean("signed"));
    }

    private static Double number(ResultSet rs, String column) throws SQLException {
        BigDecimal value = rs.getBigDecimal(column);
        return value == null ? null : value.doubleValue();
    }

    public static String code(int number) { return "TAR-%04d".formatted(number); }
}
