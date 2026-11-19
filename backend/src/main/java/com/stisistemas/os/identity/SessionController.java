package com.stisistemas.os.identity;

import com.stisistemas.os.Refusal;
import jakarta.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class SessionController {
    static final int MIN_PASSWORD = 12;
    static final int MAX_PASSWORD = 1024;
    private final Accounts accounts;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;

    public SessionController(Accounts accounts, JdbcTemplate jdbc, PasswordEncoder passwords) {
        this.accounts = accounts;
        this.jdbc = jdbc;
        this.passwords = passwords;
    }

    public record PasswordChange(String currentPassword, String newPassword) {}

    @GetMapping("/api/auth/csrf")
    Map<String, String> csrf(CsrfToken token) {
        return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
    }

    @GetMapping("/api/auth/me")
    Accounts.Account me(Principal principal) { return accounts.active(principal.getName()); }

    /**
     * The person's own password (rules 2 and 3). On the first sign-in the initial password is not asked again; any
     * other time the current one is. The new one has at least 12 characters and differs from the current one.
     * Every other session of the person ends; this one stays.
     */
    @PostMapping("/api/auth/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void changePassword(@RequestBody PasswordChange input, Principal principal, HttpServletRequest request) {
        var account = accounts.active(principal.getName());
        if (input == null || input.newPassword() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String hash = jdbc.queryForObject("SELECT password_hash FROM sti.app_user WHERE id = ? FOR UPDATE", String.class, account.id());
        if (!account.mustChangePassword()
            && (input.currentPassword() == null || !passwords.matches(input.currentPassword(), hash))) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "CONTRASENA_ACTUAL", "La contraseña actual no es correcta.");
        }
        String next = input.newPassword();
        if (next.length() < MIN_PASSWORD || next.length() > MAX_PASSWORD) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "CONTRASENA_CORTA", "La contraseña nueva tiene que tener 12 caracteres como mínimo.");
        }
        if (passwords.matches(next, hash)) {
            throw new Refusal(HttpStatus.BAD_REQUEST, "CONTRASENA_IGUAL", "La contraseña nueva tiene que ser distinta de la actual.");
        }
        jdbc.update("UPDATE sti.app_user SET password_hash = ?, must_change_password = false WHERE id = ?",
            passwords.encode(next), account.id());
        var session = request.getSession(false);
        accounts.endSessions(account.email(), session == null ? null : session.getId());
        accounts.log(account.id(), account.id(), "CAMBIO_CONTRASENA",
            Map.of("primerIngreso", account.mustChangePassword()));
    }
}
