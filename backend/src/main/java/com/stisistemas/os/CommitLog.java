package com.stisistemas.os;

import java.io.InputStream;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * D-101, D-156: at start the log says which commit this JAR came from and whether its tree had unsaved changes.
 * Nothing else of the build is written, and none of it is exposed in an answer: not in /api/health, not anywhere.
 * The same two facts are in the JAR's manifest, readable without starting it.
 */
@Component
public class CommitLog implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(CommitLog.class);

    @Override
    public void run(ApplicationArguments args) {
        var properties = new Properties();
        try (InputStream in = CommitLog.class.getResourceAsStream("/git.properties")) {
            if (in != null) properties.load(in);
        } catch (Exception unreadable) {
            // Falls through to "unknown": the log line is a convenience, never a reason not to start.
        }
        String commit = properties.getProperty("git.commit.id");
        log.info("Commit del JAR: {} dirty={}", commit == null ? "desconocido" : commit, properties.getProperty("git.dirty", "desconocido"));
    }
}
