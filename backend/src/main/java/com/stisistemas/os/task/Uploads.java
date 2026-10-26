package com.stisistemas.os.task;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Photo and signature bytes. They live in a private directory outside the web root and are never
 * served by Nginx: the backend streams them only to an account that can already see the task.
 * Names are generated here, never taken from the request, so no input reaches the file system.
 */
@Service
public class Uploads {
    public static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    public static final int MAX_SIGNATURE_BYTES = 1024 * 1024;
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
    private final Path root;

    public Uploads(@Value("${sti.uploads.dir:output/backend-local/uploads}") String directory) {
        this.root = Path.of(directory).toAbsolutePath().normalize();
    }

    /** The real type of the bytes, ignoring whatever the client declared. Null when unsupported. */
    public static String imageType(byte[] bytes) {
        if (starts(bytes, JPEG)) return "image/jpeg";
        if (starts(bytes, PNG)) return "image/png";
        return null;
    }

    public String store(byte[] bytes, String contentType) {
        String name = UUID.randomUUID() + (contentType.equals("image/png") ? ".png" : ".jpg");
        try {
            Files.createDirectories(root);
            Files.write(root.resolve(name), bytes);
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
        return name;
    }

    public byte[] read(String name) {
        Path file = root.resolve(name).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        try {
            return Files.readAllBytes(file);
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    private static boolean starts(byte[] bytes, byte[] signature) {
        if (bytes == null || bytes.length < signature.length) return false;
        for (int index = 0; index < signature.length; index++) {
            if (bytes[index] != signature[index]) return false;
        }
        return true;
    }
}
