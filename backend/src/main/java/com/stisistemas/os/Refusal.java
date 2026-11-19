package com.stisistemas.os;

import org.springframework.http.HttpStatus;

/**
 * A request the rules refuse, with a code the interface can act on and a Spanish message it can show as is.
 * Never carries a password: the message is fixed text chosen by the code that throws it.
 */
public class Refusal extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public Refusal(HttpStatus status, String code, String message) {
        super(message, null, false, false);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
}
