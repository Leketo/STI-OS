package com.stisistemas.os.identity;

import java.util.UUID;
import java.util.Locale;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class Accounts implements UserDetailsService {
    private final JdbcTemplate jdbc;

    public Accounts(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Account(UUID id, String name, String email, String role, UUID clientId) {}

    @Override
    public UserDetails loadUserByUsername(String username) {
        return jdbc.query("SELECT email, password_hash, role FROM sti.app_user WHERE email = ? AND enabled",
            (rs, n) -> User.withUsername(rs.getString("email")).password(rs.getString("password_hash"))
                .roles(rs.getString("role")).build(), username.trim().toLowerCase(Locale.ROOT))
            .stream().findFirst().orElseThrow(() -> new UsernameNotFoundException("Invalid account"));
    }

    public Account active(String email) {
        return jdbc.query("SELECT id, display_name, email, role, client_id FROM sti.app_user WHERE email = ? AND enabled",
            (rs, n) -> new Account(rs.getObject("id", UUID.class), rs.getString("display_name"),
                rs.getString("email"), rs.getString("role"), rs.getObject("client_id", UUID.class)), email)
            .stream().findFirst().orElseThrow(() -> new UsernameNotFoundException("Invalid account"));
    }
}
