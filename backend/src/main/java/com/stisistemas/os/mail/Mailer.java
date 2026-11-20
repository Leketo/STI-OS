package com.stisistemas.os.mail;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.UnsupportedEncodingException;
import java.util.Locale;
import java.util.Properties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/**
 * Sends one message over SMTP with SSL from the start (rule 10). The certificate is really validated and the host
 * name checked; the waits are bounded. If the configuration is missing the application starts all the same and
 * {@link #configured()} says no.
 */
@Component
public class Mailer {
    static final String SENDER_NAME = "STI-OS";
    private final MailSettings settings;
    private final ObjectProvider<MailTls> tls;
    private volatile JavaMailSenderImpl sender;

    public Mailer(MailSettings settings, ObjectProvider<MailTls> tls) {
        this.settings = settings;
        this.tls = tls;
    }

    public boolean configured() { return settings.configured(); }

    public String publicUrl() { return settings.publicUrl(); }

    /** Fails with the mail library's exception; callers keep only its class, never its text. */
    public void send(String to, String subject, String text, String html) throws MessagingException {
        if (!configured()) throw new IllegalStateException("mail not configured");
        var sender = sender();
        MimeMessage message = sender.createMimeMessage();
        var helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(from());
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(text, html);
        sender.send(message);
    }

    private InternetAddress from() throws MessagingException {
        var parsed = new InternetAddress(settings.from(), true);
        if (parsed.getPersonal() == null) {
            try {
                parsed.setPersonal(SENDER_NAME, "UTF-8");
            } catch (UnsupportedEncodingException impossible) {
                throw new MessagingException("encoding", impossible);
            }
        }
        return parsed;
    }

    private JavaMailSenderImpl sender() {
        var current = sender;
        if (current != null) return current;
        synchronized (this) {
            if (sender != null) return sender;
            var created = new JavaMailSenderImpl();
            created.setProtocol("smtps");
            created.setHost(settings.host());
            created.setPort(settings.port());
            created.setDefaultEncoding("UTF-8");
            boolean authenticated = settings.username() != null;
            if (authenticated) {
                created.setUsername(settings.username());
                created.setPassword(settings.password() == null ? "" : settings.password());
            }
            Properties p = created.getJavaMailProperties();
            p.put("mail.smtps.ssl.enable", "true");
            p.put("mail.smtps.ssl.checkserveridentity", "true");
            p.put("mail.smtps.ssl.protocols", "TLSv1.2 TLSv1.3");
            p.put("mail.smtps.auth", Boolean.toString(authenticated));
            p.put("mail.smtps.connectiontimeout", "10000");
            p.put("mail.smtps.timeout", "20000");
            p.put("mail.smtps.writetimeout", "20000");
            p.put("mail.debug", "false");
            var trust = tls.getIfAvailable();
            if (trust != null) p.put("mail.smtps.ssl.socketFactory", trust.socketFactory());
            sender = created;
            return created;
        }
    }

    /**
     * Rule 2 (D-151): reserved domains never get a real mail. example.com, example.net and example.org with their
     * subdomains, and everything ending in .invalid, .test or .example.
     */
    public static boolean reservedDomain(String email) {
        if (email == null) return false;
        int at = email.lastIndexOf('@');
        if (at < 0) return false;
        String domain = email.substring(at + 1).toLowerCase(Locale.ROOT).replaceAll("\\.+$", "");
        for (String suffix : new String[]{".invalid", ".test", ".example"}) if (domain.endsWith(suffix)) return true;
        for (String base : new String[]{"example.com", "example.net", "example.org"}) {
            if (domain.equals(base) || domain.endsWith("." + base)) return true;
        }
        return false;
    }
}
