package com.stisistemas.os.identity;

import java.security.Principal;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class AccountController {
    private static final Set<String> ROLES = Set.of("ADMIN", "SUPERVISOR", "USUARIO", "CLIENTE");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private final JdbcTemplate jdbc;
    private final Accounts accounts;
    private final PasswordEncoder passwords;

    public AccountController(JdbcTemplate jdbc, Accounts accounts, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.passwords = passwords;
    }

    public record NewAccount(String name, String email, String password, String role, UUID clientId) {}

    @PostMapping("/api/accounts")
    @ResponseStatus(HttpStatus.CREATED)
    Accounts.Account create(@RequestBody NewAccount input, Principal principal) {
        if (!accounts.active(principal.getName()).role().equals("ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (input == null || input.name() == null || input.email() == null || input.password() == null || input.role() == null
            || !ROLES.contains(input.role())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String name = input.name().trim();
        String email = input.email().trim().toLowerCase(Locale.ROOT);
        if (name.isEmpty() || name.length() > 200 || email.length() > 254 || !EMAIL.matcher(email).matches()
            || input.password().length() < 12 || input.password().length() > 1024
            || (input.role().equals("CLIENTE") != (input.clientId() != null))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (input.clientId() != null && jdbc.queryForObject(
            "SELECT count(*) FROM sti.client WHERE id = ?", Integer.class, input.clientId()) == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        UUID id = UUID.randomUUID();
        try {
            jdbc.update("INSERT INTO sti.app_user (id, display_name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?, ?)",
                id, name, email, passwords.encode(input.password()), input.role(), input.clientId());
        } catch (DuplicateKeyException duplicate) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        return new Accounts.Account(id, name, email, input.role(), input.clientId());
    }
}
