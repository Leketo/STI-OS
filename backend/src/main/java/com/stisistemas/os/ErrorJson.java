package com.stisistemas.os;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * QA-003: where the servlet container sends what no handler answered (an address that does not exist, a wrong
 * method, an error before the application). It replaces Spring Boot's error page, which wrote the tool's own HTML,
 * the server's time and the path. Whatever the browser asks for, the answer is the application's JSON with only
 * the status.
 */
@Controller
public class ErrorJson implements ErrorController {
    @RequestMapping("/error")
    ResponseEntity<Map<String, Integer>> error(HttpServletRequest request) {
        Object raw = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        HttpStatus status = raw instanceof Integer code && code >= 400 && code < 600 && HttpStatus.resolve(code) != null
            ? HttpStatus.valueOf(code)
            : raw == null ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(Map.of("status", status.value()));
    }
}
