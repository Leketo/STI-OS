package com.stisistemas.os.identity;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Counts events per key inside a sliding window, in memory and with a ceiling on how many keys it holds (rule 13,
 * D-159: a restart or a deployment wipes it). Keys are a hash of the normalized text, so what a person typed is
 * not kept as such; the hash itself lives in memory only and never in a log or in the database (D-160).
 *
 * <p>When the ceiling is reached the expired keys go first and then the oldest ones. Whoever floods it with
 * distinct keys can push out the oldest, never make the application run out of memory.
 */
final class Throttle {
    private final Clock clock;
    private final int capacity;
    private final Map<String, ArrayDeque<Long>> events = new LinkedHashMap<>();

    Throttle(Clock clock, int capacity) {
        this.clock = clock;
        this.capacity = capacity;
    }

    /** The key for a typed email: trimmed, lower case, cut to a sane length, then hashed. */
    static String key(String typed) {
        String normalized = typed == null ? "" : typed.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > 320) normalized = normalized.substring(0, 320);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(normalized.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().withoutPadding().encodeToString(digest);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    /** Adds one event now and answers how many the key has inside the window, this one included. */
    synchronized int hit(String key, Duration window) {
        long now = clock.millis();
        var queue = events.remove(key);
        if (queue == null) queue = new ArrayDeque<>();
        trim(queue, now, window);
        queue.addLast(now);
        events.put(key, queue);
        shrink(now, window);
        return queue.size();
    }

    synchronized void clear(String key) { events.remove(key); }

    synchronized int size() { return events.size(); }

    private static void trim(ArrayDeque<Long> queue, long now, Duration window) {
        long from = now - window.toMillis();
        while (!queue.isEmpty() && queue.peekFirst() <= from) queue.removeFirst();
    }

    private void shrink(long now, Duration window) {
        if (events.size() <= capacity) return;
        for (Iterator<Map.Entry<String, ArrayDeque<Long>>> it = events.entrySet().iterator(); it.hasNext() && events.size() > capacity; ) {
            var entry = it.next();
            trim(entry.getValue(), now, window);
            if (entry.getValue().isEmpty()) it.remove();
        }
        for (Iterator<String> it = events.keySet().iterator(); it.hasNext() && events.size() > capacity; ) {
            it.next();
            it.remove();
        }
    }
}
