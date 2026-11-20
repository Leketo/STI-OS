package com.stisistemas.os;

import org.flywaydb.core.Flyway;

/**
 * Separate deployment process. Never started from the web application. The password comes from the credentials
 * directory when run under systemd (N-35), or from the environment in the rehearsal; never from an argument.
 */
public final class Migrate {
    public static void main(String[] args) {
        Flyway.configure().dataSource(required("STI_DB_URL"), required("STI_MIGRATION_USER"),
                Credentials.secret("STI_MIGRATION_PASSWORD"))
            .schemas("sti").defaultSchema("sti").createSchemas(false)
            .locations("classpath:db/migration").load().migrate();
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + name);
        return value;
    }
}
