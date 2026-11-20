package com.stisistemas.os.identity;

import java.io.IOException;
import java.time.Clock;
import java.util.Locale;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;

@Configuration
public class SecurityConfiguration {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    /** The memory windows of the sign-in brakes read this clock; the tests move it. */
    @Bean Clock clock() { return Clock.systemUTC(); }

    @Bean SecurityFilterChain security(HttpSecurity http, JdbcTemplate jdbc, AuthLimits limits) throws Exception {
        return http
            .addFilterBefore(new AuthLimitsFilter(limits), UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(new AccountStateFilter(jdbc), AuthorizationFilter.class)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/csrf", "/api/auth/login", "/api/health", "/error").permitAll()
                // Rule 12: the only addresses new to someone without a session, all under /api/auth/.
                .requestMatchers("/api/auth/password-recovery", "/api/auth/password-recovery/check",
                    "/api/auth/password-recovery/confirm").permitAll()
                .requestMatchers("/api/**").authenticated().anyRequest().denyAll())
            .requestCache(cache -> cache.disable())
            .formLogin(login -> login.loginProcessingUrl("/api/auth/login")
                .successHandler((request, response, authentication) -> {
                    limits.succeeded(authentication.getName());
                    response.setStatus(204);
                })
                .failureHandler((request, response, exception) -> {
                    // The failure that starts the block already answers with the block's message (rule 13).
                    if (limits.failed(typed(request.getParameter("username")))) AuthLimitsFilter.write(response, AuthLimitsFilter.BLOCKED);
                    else error(response, 401);
                }))
            .logout(logout -> logout.logoutUrl("/api/auth/logout")
                .deleteCookies("STI_SESSION")
                .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, exception) -> error(response, 401))
                .accessDeniedHandler((request, response, exception) -> error(response, 403)))
            .build();
    }

    private static String typed(String username) { return username == null ? "" : username.trim().toLowerCase(Locale.ROOT); }

    private static void error(HttpServletResponse response, int status) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"status\":" + status + "}");
    }
}
