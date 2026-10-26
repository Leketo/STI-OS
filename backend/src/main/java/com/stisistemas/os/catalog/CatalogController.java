package com.stisistemas.os.catalog;

import com.stisistemas.os.identity.Accounts;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class CatalogController {
    private final JdbcTemplate jdbc;
    private final Accounts accounts;
    public CatalogController(JdbcTemplate jdbc, Accounts accounts) { this.jdbc = jdbc; this.accounts = accounts; }

    record Client(UUID id, String name) {}
    record Project(UUID id, UUID clientId, String name) {}

    @GetMapping("/api/clients")
    List<Client> clients(Principal principal) {
        var account = accounts.active(principal.getName());
        boolean customer = account.role().equals("CLIENTE");
        return jdbc.query("SELECT id, name FROM sti.client" + (customer ? " WHERE id = ?" : "") + " ORDER BY name, id LIMIT 100",
            (rs, n) -> new Client(rs.getObject("id", UUID.class), rs.getString("name")),
            customer ? new Object[]{account.clientId()} : new Object[]{});
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
}
