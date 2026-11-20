package com.stisistemas.os;

import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;
import jakarta.mail.BodyPart;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.MimeMessage;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManagerFactory;

/**
 * What the mail tests share (D-155): a fake SMTP server over SSL from the start, with a certificate this test makes
 * itself, and the socket factory that trusts exactly that certificate. Test scope only; none of this is in the JAR.
 */
final class MailSupport {
    static final String KEYSTORE_PASSWORD = "prueba-solo-para-test";
    static final String SMTP_USER = "notificador";
    static final String SMTP_PASSWORD = "clave-smtp-de-prueba-" + java.util.UUID.randomUUID();
    private static Path keystore;

    private MailSupport() {}

    /** A self-signed certificate for localhost, made with the JDK's own keytool. */
    static synchronized Path keystore() {
        if (keystore != null) return keystore;
        try {
            Path directory = Files.createDirectories(Path.of("target", "test-mail"));
            Path file = directory.resolve("smtp-" + java.util.UUID.randomUUID() + ".p12");
            String keytool = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").toLowerCase().contains("win") ? "keytool.exe" : "keytool").toString();
            var process = new ProcessBuilder(keytool, "-genkeypair", "-alias", "sti", "-keyalg", "RSA", "-keysize", "2048",
                "-validity", "30", "-dname", "CN=localhost", "-ext", "san=dns:localhost", "-storetype", "PKCS12",
                "-keystore", file.toString(), "-storepass", KEYSTORE_PASSWORD, "-keypass", KEYSTORE_PASSWORD)
                .redirectErrorStream(true).start();
            String out = new String(process.getInputStream().readAllBytes());
            if (!process.waitFor(60, TimeUnit.SECONDS) || process.exitValue() != 0) throw new IllegalStateException("keytool failed: " + out);
            System.setProperty("greenmail.tls.keystore.file", file.toString());
            System.setProperty("greenmail.tls.keystore.password", KEYSTORE_PASSWORD);
            System.setProperty("greenmail.tls.key.password", KEYSTORE_PASSWORD);
            keystore = file;
            return file;
        } catch (IOException | InterruptedException failure) {
            throw new IllegalStateException(failure);
        }
    }

    static int freePort() {
        try (var socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException failure) {
            throw new IllegalStateException(failure);
        }
    }

    /** The fake server: SMTP over SSL, one account that can send. Anyone it is addressed to receives. */
    static GreenMail start(int port) {
        keystore();
        var server = new GreenMail(new ServerSetup(port, "localhost", ServerSetup.PROTOCOL_SMTPS));
        server.setUser(SMTP_USER, SMTP_PASSWORD);
        server.start();
        return server;
    }

    /** A socket factory that trusts the certificate of {@link #keystore()} and nothing else. */
    static SSLSocketFactory trustingFactory() {
        try (InputStream in = new FileInputStream(keystore().toFile())) {
            var source = KeyStore.getInstance("PKCS12");
            source.load(in, KEYSTORE_PASSWORD.toCharArray());
            Certificate certificate = source.getCertificate("sti");
            var trust = KeyStore.getInstance("PKCS12");
            trust.load(null, null);
            trust.setCertificateEntry("sti", certificate);
            var factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            factory.init(trust);
            var context = SSLContext.getInstance("TLS");
            context.init(null, factory.getTrustManagers(), null);
            return context.getSocketFactory();
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    /** The first part of the given content type, looking inside nested multiparts. */
    static String body(Part part, String type) throws Exception {
        if (part.isMimeType(type)) return (String) part.getContent();
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int i = 0; i < multipart.getCount(); i++) {
                BodyPart child = multipart.getBodyPart(i);
                String found = body(child, type);
                if (found != null) return found;
            }
        }
        return null;
    }

    static final Pattern LINK = Pattern.compile("(https?://\\S+/nueva-contrasena#([A-Za-z0-9_-]+))");

    /** The recovery link a message carries in its text part. */
    static String link(MimeMessage message) throws Exception {
        Matcher match = LINK.matcher(body(message, "text/plain"));
        if (!match.find()) throw new AssertionError("no link in the message");
        return match.group(1);
    }

    static String token(String link) { return link.substring(link.indexOf('#') + 1); }

    /** A clock the test moves by hand, for the windows that live in memory. */
    static final class MutableClock extends Clock {
        private final AtomicLong millis = new AtomicLong(System.currentTimeMillis());
        void advance(Duration by) { millis.addAndGet(by.toMillis()); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(millis.get()); }
        @Override public long millis() { return millis.get(); }
    }
}
