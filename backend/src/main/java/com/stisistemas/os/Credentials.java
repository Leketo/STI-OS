package com.stisistemas.os;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Function;

/**
 * N-35: how the migrator and the bootstrap read a password. When they run under systemd with
 * {@code LoadCredential}, {@code CREDENTIALS_DIRECTORY} points to a directory with one file per credential and the
 * password is read from the file of that name. The environment variable of the same name stays as the alternative
 * for the local rehearsal.
 *
 * <p>A password is never taken from the command line, and nothing here prints it: the errors name the credential,
 * not its value.
 */
final class Credentials {
    private Credentials() {}

    static String secret(String name) { return secret(name, System::getenv); }

    static String secret(String name, Function<String, String> environment) {
        String directory = environment.apply("CREDENTIALS_DIRECTORY");
        if (directory != null && !directory.isBlank()) {
            Path file = Path.of(directory).resolve(name);
            if (Files.isRegularFile(file)) {
                String value = read(file, name);
                if (value.isEmpty()) throw new IllegalStateException("Credential " + name + " is empty");
                return value;
            }
        }
        String value = environment.apply(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + name);
        return value;
    }

    private static String read(Path file, String name) {
        try {
            // The line break a text editor or `echo` leaves at the end is not part of the password.
            return new String(Files.readAllBytes(file), StandardCharsets.UTF_8).replaceAll("[\\r\\n]+$", "");
        } catch (IOException unreadable) {
            throw new IllegalStateException("Cannot read credential " + name);
        }
    }
}
