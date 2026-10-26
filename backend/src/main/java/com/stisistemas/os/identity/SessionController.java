package com.stisistemas.os.identity;

import java.security.Principal;
import java.util.Map;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SessionController {
    private final Accounts accounts;
    public SessionController(Accounts accounts) { this.accounts = accounts; }

    @GetMapping("/api/auth/csrf")
    Map<String, String> csrf(CsrfToken token) {
        return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
    }

    @GetMapping("/api/auth/me")
    Accounts.Account me(Principal principal) { return accounts.active(principal.getName()); }
}
