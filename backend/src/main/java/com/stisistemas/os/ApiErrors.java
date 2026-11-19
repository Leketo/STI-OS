package com.stisistemas.os;

import com.stisistemas.os.task.TaskConflict;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(UsernameNotFoundException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    Map<String, Integer> inactiveAccount() { return Map.of("status", 401); }

    /** Without this the container's upload limit surfaces as a server error instead of a size answer. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    Map<String, Integer> uploadTooLarge() { return Map.of("status", 413); }

    @ExceptionHandler(TaskConflict.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    Map<String, Object> taskConflict(TaskConflict conflict) {
        return Map.of("status", 409, "code", conflict.code(), "message", conflict.getMessage());
    }

    @ExceptionHandler(Refusal.class)
    ResponseEntity<Map<String, Object>> refusal(Refusal refusal) {
        return ResponseEntity.status(refusal.status()).body(Map.of(
            "status", refusal.status().value(), "code", refusal.code(), "message", refusal.getMessage()));
    }

    /**
     * A unique index caught a write that raced another one. The task lock makes this unexpected, but the answer
     * must still be a conflict, never a server error.
     */
    @ExceptionHandler(DuplicateKeyException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    Map<String, Object> duplicate() {
        return Map.of("status", 409, "code", "DUPLICADO",
            "message", "Otra persona registró lo mismo al mismo tiempo. Actualizá la vista.");
    }
}
