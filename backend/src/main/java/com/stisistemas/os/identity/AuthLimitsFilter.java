package com.stisistemas.os.identity;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Applies {@link AuthLimits} to the three requests that make the server check a password. It runs after the CSRF
 * check and before the sign-in itself, so a blocked email costs no password check and no database read.
 *
 * <p>Not a bean on purpose: Spring Boot would also register a bean filter in the servlet container and run it twice.
 */
public class AuthLimitsFilter extends OncePerRequestFilter {
    static final String BLOCKED = "{\"status\":429,\"code\":\"DEMASIADOS_INTENTOS\","
        + "\"message\":\"Demasiados intentos. Esperá 15 minutos o usá ¿Olvidaste tu contraseña?\"}";
    static final String BUSY = "{\"status\":429,\"code\":\"SISTEMA_OCUPADO\","
        + "\"message\":\"El sistema está ocupado. Probá de nuevo en unos segundos.\"}";
    private final AuthLimits limits;

    public AuthLimitsFilter(AuthLimits limits) { this.limits = limits; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (!"POST".equals(request.getMethod()) || !checksPassword(path)) {
            chain.doFilter(request, response);
            return;
        }
        if (path.equals("/api/auth/login") && limits.blocked(request.getParameter("username"))) {
            write(response, BLOCKED);
            return;
        }
        if (!limits.tryCheck()) {
            write(response, BUSY);
            return;
        }
        try {
            chain.doFilter(request, response);
        } finally {
            limits.endCheck();
        }
    }

    static boolean checksPassword(String path) {
        return path.equals("/api/auth/login") || path.equals("/api/auth/password")
            || path.equals("/api/auth/password-recovery/confirm");
    }

    static void write(HttpServletResponse response, String body) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(body);
    }
}
