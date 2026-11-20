package com.stisistemas.os;

import com.stisistemas.os.task.TaskConflict;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * QA-003: every error of /api answers with the application's own JSON: {@code status}, and {@code code} and
 * {@code message} when there is something to tell. Never the tool's error page, the server's time, the path or an
 * exception's text.
 *
 * <p>The framework's own refusals (unknown address, wrong method, unreadable body, upload too large, a
 * {@code ResponseStatusException}) go through {@link ResponseEntityExceptionHandler}, whose body is replaced here.
 * Whatever else escapes is a 500 with only its status; the detail goes to the server log.
 */
@RestControllerAdvice
public class ApiErrors extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body, HttpHeaders headers,
                                                             HttpStatusCode status, WebRequest request) {
        return json(status.value(), headers);
    }

    private static ResponseEntity<Object> json(int status, HttpHeaders headers) {
        var out = new HttpHeaders();
        if (headers != null) headers.forEach((name, values) -> {
            // Allow, Retry-After and the like are useful; whatever describes a body that is gone is not.
            if (!name.equalsIgnoreCase(HttpHeaders.CONTENT_TYPE) && !name.equalsIgnoreCase(HttpHeaders.CONTENT_LENGTH)) out.addAll(name, values);
        });
        out.setContentType(MediaType.APPLICATION_JSON);
        return new ResponseEntity<>(Map.of("status", status), out, HttpStatusCode.valueOf(status));
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<Object> unauthenticated() { return json(401, null); }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<Object> denied() { return json(403, null); }

    @ExceptionHandler(TaskConflict.class)
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.CONFLICT)
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
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.CONFLICT)
    Map<String, Object> duplicate() {
        return Map.of("status", 409, "code", "DUPLICADO",
            "message", "Otra persona registró lo mismo al mismo tiempo. Actualizá la vista.");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> unexpected(Exception failure) {
        log.error("Error no previsto en una dirección de /api", failure);
        return json(500, null);
    }
}
