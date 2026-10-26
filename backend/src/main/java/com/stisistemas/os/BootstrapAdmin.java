package com.stisistemas.os;

import java.sql.DriverManager;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** Offline one-time bootstrap. Run with migration credentials; never start an HTTP listener. */
public final class BootstrapAdmin {
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private BootstrapAdmin() {}

    public static void main(String[] args) throws Exception {
        String name = required("STI_INITIAL_ADMIN_NAME").trim();
        String email = required("STI_INITIAL_ADMIN_EMAIL").trim().toLowerCase(Locale.ROOT);
        String password = required("STI_INITIAL_ADMIN_PASSWORD");
        if (name.isEmpty() || name.length() > 200 || email.length() > 254 || !EMAIL.matcher(email).matches()
            || password.length() < 12 || password.length() > 1024) {
            throw new IllegalArgumentException("Invalid initial admin input");
        }
        var encoder = new BCryptPasswordEncoder(12);
        String hash = encoder.encode(password);
        try (var connection = DriverManager.getConnection(required("STI_DB_URL"),
            required("STI_MIGRATION_USER"), required("STI_MIGRATION_PASSWORD"))) {
            connection.setAutoCommit(false);
            try (var lock = connection.prepareStatement("SELECT pg_advisory_xact_lock(19283, 1)")) {
                lock.execute();
            }
            long existing;
            try (var count = connection.prepareStatement("SELECT count(*) FROM sti.app_user");
                 var rows = count.executeQuery()) {
                rows.next();
                existing = rows.getLong(1);
            }
            if (existing != 0) {
                if (existing != 1) throw new IllegalStateException("Bootstrap requires an empty or matching single-admin table");
                try (var query = connection.prepareStatement("SELECT display_name, email, role, password_hash, enabled FROM sti.app_user");
                     var rows = query.executeQuery()) {
                    rows.next();
                    if (!name.equals(rows.getString("display_name")) || !email.equals(rows.getString("email"))
                        || !"ADMIN".equals(rows.getString("role")) || !rows.getBoolean("enabled")
                        || !encoder.matches(password, rows.getString("password_hash"))) {
                        throw new IllegalStateException("Existing initial administrator does not match protected local credentials");
                    }
                }
                connection.commit();
                System.out.println("Initial administrator already present");
                return;
            }
            try (var insert = connection.prepareStatement("INSERT INTO sti.app_user "
                + "(id, display_name, email, password_hash, role, client_id) VALUES (?, ?, ?, ?, 'ADMIN', NULL)")) {
                insert.setObject(1, UUID.randomUUID());
                insert.setString(2, name);
                insert.setString(3, email);
                insert.setString(4, hash);
                insert.executeUpdate();
            }
            connection.commit();
        }
        System.out.println("Initial administrator created");
    }

    private static String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + key);
        return value;
    }
}
