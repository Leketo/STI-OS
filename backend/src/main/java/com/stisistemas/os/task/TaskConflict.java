package com.stisistemas.os.task;

/**
 * A request that the task's current state does not allow. It answers 409 with a code for the interface and a
 * message in Spanish meant for the person, so neither has to guess what went wrong.
 */
public class TaskConflict extends RuntimeException {
    private final String code;

    public TaskConflict(String code, String message) {
        super(message, null, false, false);
        this.code = code;
    }

    public String code() { return code; }
}
