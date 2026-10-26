package com.stisistemas.os;

import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final JdbcTemplate jdbc;
    public HealthController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @GetMapping("/api/health")
    ResponseEntity<Map<String, String>> health() {
        try {
            jdbc.queryForObject("SELECT count(*) FROM sti.spring_session WHERE false", Long.class);
            return ResponseEntity.ok(Map.of("status", "UP"));
        } catch (DataAccessException failure) {
            return ResponseEntity.status(503).body(Map.of("status", "DOWN"));
        }
    }
}
