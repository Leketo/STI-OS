package com.stisistemas.os.identity;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Recovering the password without a session (rule 12): the only new addresses open to someone who is not signed
 * in. All under /api/auth/, which the front end already forwards, so the server's rewrites do not change.
 */
@RestController
public class RecoveryController {
    private final PasswordRecovery recovery;

    public RecoveryController(PasswordRecovery recovery) { this.recovery = recovery; }

    public record Request(String email) {}
    public record Link(String token) {}
    public record Confirmation(String token, String newPassword) {}

    /** Rule 1: the same answer, the same code, whatever the email is. */
    @PostMapping("/api/auth/password-recovery")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void request(@RequestBody Request input) { recovery.request(input == null ? null : input.email()); }

    /** Lets the page say "this link no longer works" before the person types anything. */
    @PostMapping("/api/auth/password-recovery/check")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void check(@RequestBody Link input) { recovery.check(input == null ? null : input.token()); }

    @PostMapping("/api/auth/password-recovery/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirm(@RequestBody Confirmation input) {
        recovery.confirm(input == null ? null : input.token(), input == null ? null : input.newPassword());
    }
}
