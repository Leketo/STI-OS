package com.stisistemas.os.identity;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Checks the account behind an authenticated session on every request, after authorization.
 *
 * <ul>
 *   <li>Rule 5: a deactivated account, or one whose email changed, is no longer served. Its session ends on the
 *       next request, whatever endpoint it calls, and the answer is 401.</li>
 *   <li>Rule 2 (D-86): with an initial password in force, only the CSRF token, the own session, the password
 *       change and logout are served. Everything else answers 403 {@code CAMBIO_DE_CONTRASENA}. Logout never gets
 *       here: Spring Security's logout filter answers it earlier.</li>
 * </ul>
 *
 * Not a bean on purpose: Spring Boot would also register a bean filter in the servlet container and run it twice.
 */
public class AccountStateFilter extends OncePerRequestFilter {
    private static final String CHANGE_REQUIRED = "{\"status\":403,\"code\":\"CAMBIO_DE_CONTRASENA\","
        + "\"message\":\"Antes de seguir tenés que cambiar la contraseña inicial por una tuya.\"}";
    private final JdbcTemplate jdbc;

    public AccountStateFilter(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
            || authentication instanceof AnonymousAuthenticationToken) {
            chain.doFilter(request, response);
            return;
        }
        List<Map<String, Object>> state = jdbc.queryForList(
            "SELECT must_change_password FROM sti.app_user WHERE email = ? AND enabled", authentication.getName());
        if (state.isEmpty()) {
            var session = request.getSession(false);
            if (session != null) session.invalidate();
            SecurityContextHolder.clearContext();
            write(response, 401, "{\"status\":401}");
            return;
        }
        if (Boolean.TRUE.equals(state.get(0).get("must_change_password")) && !allowedWhileChanging(request)) {
            write(response, 403, CHANGE_REQUIRED);
            return;
        }
        chain.doFilter(request, response);
    }

    static boolean allowedWhileChanging(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        String method = request.getMethod();
        return ("GET".equals(method) && (path.equals("/api/auth/csrf") || path.equals("/api/auth/me")))
            || ("POST".equals(method) && path.equals("/api/auth/password"));
    }

    private static void write(HttpServletResponse response, int status, String body) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(body);
    }
}
