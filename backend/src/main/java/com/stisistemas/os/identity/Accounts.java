package com.stisistemas.os.identity;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
public class Accounts implements UserDetailsService {
    /** No 0/O, 1/l/I: the initial password is read aloud or copied by hand to the person. */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    public Accounts(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Account(UUID id, String name, String email, String role, UUID clientId, boolean mustChangePassword) {}

    @Override
    public UserDetails loadUserByUsername(String username) {
        return jdbc.query("SELECT email, password_hash, role FROM sti.app_user WHERE email = ? AND enabled",
            (rs, n) -> User.withUsername(rs.getString("email")).password(rs.getString("password_hash"))
                .roles(rs.getString("role")).build(), username.trim().toLowerCase(Locale.ROOT))
            .stream().findFirst().orElseThrow(() -> new UsernameNotFoundException("Invalid account"));
    }

    public Account active(String email) {
        return jdbc.query("SELECT id, display_name, email, role, client_id, must_change_password FROM sti.app_user WHERE email = ? AND enabled",
            (rs, n) -> new Account(rs.getObject("id", UUID.class), rs.getString("display_name"),
                rs.getString("email"), rs.getString("role"), rs.getObject("client_id", UUID.class),
                rs.getBoolean("must_change_password")), email)
            .stream().findFirst().orElseThrow(() -> new UsernameNotFoundException("Invalid account"));
    }

    /**
     * An initial password (D-23): drawn by the system with a secure generator, different on every call, shown once
     * and never stored in clear. 16 characters from 56 symbols, about 93 bits, in four groups for reading aloud.
     */
    public static String initialPassword() {
        var out = new StringBuilder(19);
        for (int i = 0; i < 16; i++) {
            if (i > 0 && i % 4 == 0) out.append('-');
            out.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return out.toString();
    }

    /** Ends every session of the account, or every one but {@code keepSessionId}. Spring Session keys them by email. */
    public int endSessions(String email, String keepSessionId) {
        return keepSessionId == null
            ? jdbc.update("DELETE FROM sti.spring_session WHERE principal_name = ?", email)
            : jdbc.update("DELETE FROM sti.spring_session WHERE principal_name = ? AND session_id <> ?", email, keepSessionId);
    }

    /** Rule 10: the account log. {@code changes} never carries a password, in clear or hashed. */
    public void log(UUID accountId, UUID actorId, String kind, Map<String, ?> changes) {
        String body;
        try {
            body = json.writeValueAsString(changes == null ? Map.of() : changes);
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
        jdbc.update("INSERT INTO sti.account_event (id, account_id, actor_id, kind, changes) VALUES (?, ?, ?, ?, ?::jsonb)",
            UUID.randomUUID(), accountId, actorId, kind, body);
    }
}
