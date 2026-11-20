package com.stisistemas.os;

import com.jayway.jsonpath.JsonPath;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

/** A person's browser for the tests: its own cookies, the CSRF dance, and the sign-in form. Plain HTTP on loopback. */
final class TestBrowser {
    final int port;
    final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();

    TestBrowser(int port) { this.port = port; }

    URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }

    HttpResponse<String> get(String path) throws Exception { return get(path, new String[0]); }

    HttpResponse<String> get(String path, String... headers) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).GET();
        if (headers.length > 0) request.headers(headers);
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    String csrf() throws Exception { return JsonPath.read(get("/api/auth/csrf").body(), "$.token"); }

    /** JSON with a fresh CSRF token, as the real pages do. */
    HttpResponse<String> post(String path, String body, String... headers) throws Exception {
        return json("POST", path, body, csrf(), headers);
    }

    HttpResponse<String> json(String method, String path, String body, String csrf, String... headers) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json");
        if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
        if (headers.length > 0) request.headers(headers);
        return client.send(request.method(method, HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    HttpResponse<String> loginResponse(String email, String password) throws Exception {
        String form = "username=" + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8);
        var request = HttpRequest.newBuilder(uri("/api/auth/login")).header("Content-Type", "application/x-www-form-urlencoded")
            .header("X-CSRF-TOKEN", csrf()).POST(HttpRequest.BodyPublishers.ofString(form)).build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    int login(String email, String password) throws Exception { return loginResponse(email, password).statusCode(); }
}
