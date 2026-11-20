package com.stisistemas.os;

import com.icegreen.greenmail.util.GreenMail;
import jakarta.mail.internet.MimeMessage;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/**
 * The fake mail server of the browser rehearsal (D-155: Mailpit has no SSL from the start, so GreenMail). It is not a
 * test: it only runs when ensayo.ps1 asks for it with -Drehearsal.mail=true, so the suite skips it. Test scope, never in
 * the JAR. Over SSL from the start on a fixed port, with its own certificate. Every message that arrives is written as
 * a text file under the rehearsal folder, so the browser session can open the link of the mail; the files hold the
 * link, so they live in output/ (outside Git) and Bajar removes them. It stops when the file "parar" appears.
 */
class RehearsalMailServer {
    @Test
    @EnabledIfSystemProperty(named = "rehearsal.mail", matches = "true")
    void serves() throws Exception {
        Path folder = Path.of(System.getProperty("rehearsal.mail.dir", "../output/ensayo/correo")).toAbsolutePath().normalize();
        Files.createDirectories(folder);
        Files.deleteIfExists(folder.resolve("parar"));
        int port = Integer.getInteger("rehearsal.mail.port", 3465);
        Path pkcs = MailSupport.keystore();

        // The certificate alone, for the web process to trust in the rehearsal (never the private key).
        var source = KeyStore.getInstance("PKCS12");
        try (var in = new FileInputStream(pkcs.toFile())) { source.load(in, MailSupport.KEYSTORE_PASSWORD.toCharArray()); }
        var trust = KeyStore.getInstance("PKCS12");
        trust.load(null, null);
        trust.setCertificateEntry("sti", source.getCertificate("sti"));
        try (var out = Files.newOutputStream(folder.resolve("truststore.p12"))) { trust.store(out, MailSupport.KEYSTORE_PASSWORD.toCharArray()); }

        GreenMail server = MailSupport.start(port);
        Files.writeString(folder.resolve("servidor.txt"), "port=" + port + "\nuser=" + MailSupport.SMTP_USER + "\npassword=" + MailSupport.SMTP_PASSWORD + "\ntruststorePassword=" + MailSupport.KEYSTORE_PASSWORD + "\n", StandardCharsets.UTF_8);
        Files.writeString(folder.resolve("listo"), "ok", StandardCharsets.UTF_8);
        int written = 0;
        try {
            while (!Files.exists(folder.resolve("parar"))) {
                MimeMessage[] all = server.getReceivedMessages();
                for (; written < all.length; written++) {
                    MimeMessage message = all[written];
                    String text = MailSupport.body(message, "text/plain");
                    String html = MailSupport.body(message, "text/html");
                    String head = "To: " + String.join(", ", java.util.Arrays.stream(message.getAllRecipients()).map(Object::toString).toList())
                        + "\nFrom: " + String.join(", ", java.util.Arrays.stream(message.getFrom()).map(Object::toString).toList())
                        + "\nSubject: " + message.getSubject() + "\n\n";
                    Files.writeString(folder.resolve(String.format("%03d.txt", written + 1)), head + text, StandardCharsets.UTF_8);
                    if (html != null) Files.writeString(folder.resolve(String.format("%03d.html", written + 1)), html, StandardCharsets.UTF_8);
                }
                Thread.sleep(200);
            }
        } finally {
            server.stop();
            Files.deleteIfExists(folder.resolve("listo"));
        }
    }
}
