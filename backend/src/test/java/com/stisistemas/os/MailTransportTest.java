package com.stisistemas.os;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.icegreen.greenmail.util.GreenMail;
import com.stisistemas.os.mail.MailSettings;
import com.stisistemas.os.mail.MailTls;
import com.stisistemas.os.mail.Mailer;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

/**
 * CA-36, the part about the connection (D-155): SMTP over SSL from the start, with the certificate really
 * validated. The fake server answers with a certificate this test made for "localhost". The same mailer fails when
 * it does not trust that certificate and works when it does; it also fails when the name it connects to is not the
 * one in the certificate. No Spring context here: the mailer is built by hand, exactly as the application builds it.
 */
class MailTransportTest {
    static GreenMail server;
    static int port;

    @BeforeAll static void start() {
        port = MailSupport.freePort();
        server = MailSupport.start(port);
    }

    @AfterAll static void stop() { server.stop(); }

    private static ObjectProvider<MailTls> trust(boolean yes) {
        return new ObjectProvider<>() {
            @Override public MailTls getObject() { throw new UnsupportedOperationException(); }
            @Override public MailTls getObject(Object... args) { throw new UnsupportedOperationException(); }
            @Override public MailTls getIfAvailable() { return yes ? MailSupport::trustingFactory : null; }
            @Override public MailTls getIfUnique() { return getIfAvailable(); }
        };
    }

    private static java.util.List<String> chain(Throwable failure) {
        var names = new java.util.ArrayList<String>();
        for (Throwable t = failure; t != null && names.size() < 10; t = t.getCause()) names.add(t.getClass().getSimpleName());
        return names;
    }

    private static MailSettings settings(String host) {
        return new MailSettings(host, port, MailSupport.SMTP_USER, MailSupport.SMTP_PASSWORD,
            "STI-OS <notificaciones@stisistemas.com>", "https://app.stisistemas.com");
    }

    @Test void withoutTrustInTheCertificateTheMailDoesNotGoOut() throws Exception {
        server.purgeEmailFromAllMailboxes();
        var mailer = new Mailer(settings("localhost"), trust(false));
        assertThatThrownBy(() -> mailer.send("alguien@correo-prueba.com", "Asunto", "texto", "<p>html</p>"))
            .as("a certificate nobody vouches for is refused, there is no 'trust everyone'")
            .satisfies(failure -> assertThat(chain(failure)).contains("SSLHandshakeException"));
        assertThat(server.getReceivedMessages()).isEmpty();
    }

    @Test void trustingTheCertificateAndWithTheRightNameTheMailGoesOut() throws Exception {
        server.purgeEmailFromAllMailboxes();
        new Mailer(settings("localhost"), trust(true)).send("alguien@correo-prueba.com", "Asunto de prueba", "texto plano", "<p>html</p>");
        assertThat(server.waitForIncomingEmail(5000, 1)).isTrue();
        MimeMessage message = server.getReceivedMessages()[0];
        assertThat(message.getSubject()).isEqualTo("Asunto de prueba");
        assertThat(message.getFrom()[0].toString()).contains("STI-OS").contains("notificaciones@stisistemas.com");
        assertThat(MailSupport.body(message, "text/plain")).contains("texto plano");
        assertThat(MailSupport.body(message, "text/html")).contains("<p>html</p>");
    }

    @Test void aServerNameThatIsNotInTheCertificateIsRefusedEvenIfTheCertificateIsTrusted() throws Exception {
        server.purgeEmailFromAllMailboxes();
        // The certificate is for "localhost" and has no IP address: connecting by 127.0.0.1 must not pass.
        var mailer = new Mailer(settings("127.0.0.1"), trust(true));
        assertThatThrownBy(() -> mailer.send("alguien@correo-prueba.com", "Asunto", "texto", "<p>html</p>"))
            .as("the host name is checked").isInstanceOf(Exception.class);
        assertThat(server.getReceivedMessages()).isEmpty();
    }

    @Test void withoutConfigurationTheMailerSaysSoAndSendsNothing() {
        var empty = new MailSettings(null, null, null, null, null, null);
        assertThat(empty.configured()).isFalse();
        assertThat(empty.port()).isEqualTo(465);
        assertThat(new Mailer(empty, trust(false)).configured()).isFalse();
        assertThat(new MailSettings("host", 465, "u", "p", null, "https://app.stisistemas.com").configured()).as("no sender").isFalse();
        assertThat(new MailSettings("host", 465, "u", "p", "a@b.com", null).configured()).as("no public address").isFalse();
        assertThat(new MailSettings("host", 465, "u", "p", "a@b.com", "ftp://x").configured()).as("not http(s)").isFalse();
    }

    @Test void thePasswordIsNotPrintedAndATrailingLineBreakIsNotPartOfIt() {
        var s = new MailSettings("host", 465, "u", "secreto-uno\n", "a@b.com", "https://app.stisistemas.com/");
        assertThat(s.password()).isEqualTo("secreto-uno");
        assertThat(s.publicUrl()).as("no trailing slash").isEqualTo("https://app.stisistemas.com");
        assertThat(s.toString()).doesNotContain("secreto-uno");
    }

    @Test void reservedDomainsNeverGetAMail() {
        for (String reserved : new String[]{"a@example.invalid", "a@example.com", "a@example.net", "a@example.org",
            "a@x.invalid", "a@x.test", "a@x.example", "a@sub.example.com", "a@A.EXAMPLE.ORG", "a@mail.example.net."}) {
            assertThat(Mailer.reservedDomain(reserved)).as(reserved).isTrue();
        }
        for (String real : new String[]{"a@stisistemas.com", "a@examples.com", "a@myexample.org", "a@example.com.py",
            "a@correo-prueba.com", "a@testing.com", "a@invalid.com", "a@gmail.com"}) {
            assertThat(Mailer.reservedDomain(real)).as(real).isFalse();
        }
    }
}
