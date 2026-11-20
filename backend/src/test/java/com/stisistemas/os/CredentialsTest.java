package com.stisistemas.os;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.function.Function;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * N-35, CA-41: the migrator and the bootstrap read a password from the credentials directory when they run under
 * systemd, and from the environment variable of the same name otherwise. The real programs are exercised against a
 * real database by the rehearsal ({@code ensayo.ps1 -Accion Levantar}); here is the rule itself.
 */
class CredentialsTest {
    @TempDir Path directory;

    private static Function<String, String> environment(Map<String, String> values) { return values::get; }

    @Test void aFileInTheCredentialsDirectoryIsTheFirstChoice() throws Exception {
        Files.writeString(directory.resolve("STI_MIGRATION_PASSWORD"), "desde-el-archivo", StandardCharsets.UTF_8);
        var env = environment(Map.of("CREDENTIALS_DIRECTORY", directory.toString(), "STI_MIGRATION_PASSWORD", "desde-la-variable"));
        assertThat(Credentials.secret("STI_MIGRATION_PASSWORD", env)).isEqualTo("desde-el-archivo");
    }

    @Test void theLineBreakAtTheEndOfTheFileIsNotPartOfThePassword() throws Exception {
        Files.writeString(directory.resolve("STI_INITIAL_ADMIN_PASSWORD"), "una clave con espacios \n", StandardCharsets.UTF_8);
        assertThat(Credentials.secret("STI_INITIAL_ADMIN_PASSWORD", environment(Map.of("CREDENTIALS_DIRECTORY", directory.toString()))))
            .isEqualTo("una clave con espacios ");
        Files.writeString(directory.resolve("STI_MIGRATION_PASSWORD"), "otra\r\n", StandardCharsets.UTF_8);
        assertThat(Credentials.secret("STI_MIGRATION_PASSWORD", environment(Map.of("CREDENTIALS_DIRECTORY", directory.toString())))).isEqualTo("otra");
    }

    @Test void theVariableStillWorksForTheLocalRehearsal() {
        assertThat(Credentials.secret("STI_MIGRATION_PASSWORD", environment(Map.of("STI_MIGRATION_PASSWORD", "variable")))).isEqualTo("variable");
        // A credentials directory without that file falls back to the variable.
        assertThat(Credentials.secret("STI_MIGRATION_PASSWORD", environment(Map.of("CREDENTIALS_DIRECTORY", directory.toString(), "STI_MIGRATION_PASSWORD", "variable"))))
            .isEqualTo("variable");
    }

    @Test void withNeitherItStopsAndNamesTheCredentialNotItsValue() throws Exception {
        assertThatThrownBy(() -> Credentials.secret("STI_MIGRATION_PASSWORD", environment(Map.of()))).hasMessage("Missing STI_MIGRATION_PASSWORD");
        assertThatThrownBy(() -> Credentials.secret("STI_MIGRATION_PASSWORD", environment(Map.of("STI_MIGRATION_PASSWORD", "  ")))).hasMessage("Missing STI_MIGRATION_PASSWORD");
        Files.writeString(directory.resolve("STI_MIGRATION_PASSWORD"), "\n");
        assertThatThrownBy(() -> Credentials.secret("STI_MIGRATION_PASSWORD", environment(Map.of("CREDENTIALS_DIRECTORY", directory.toString()))))
            .hasMessage("Credential STI_MIGRATION_PASSWORD is empty");
    }

    @Test void aDirectoryInPlaceOfTheFileIsNotRead() throws Exception {
        Files.createDirectory(directory.resolve("STI_MIGRATION_PASSWORD"));
        assertThatThrownBy(() -> Credentials.secret("STI_MIGRATION_PASSWORD", environment(Map.of("CREDENTIALS_DIRECTORY", directory.toString()))))
            .hasMessage("Missing STI_MIGRATION_PASSWORD");
    }
}
