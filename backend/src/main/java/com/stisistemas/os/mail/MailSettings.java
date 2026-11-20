package com.stisistemas.os.mail;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where the mail goes and from where (D-38). Everything but the password is read from the configuration; the
 * password arrives through the same credentials mechanism as the database one (configtree files) and is never
 * printed: {@link #toString()} leaves it out on purpose.
 *
 * <p>The connection is always SMTP over SSL from the start (port 465 by default); there is no switch to turn that
 * off. {@code publicUrl} is the only base the recovery link is built from: never the host of a request.
 */
@ConfigurationProperties("sti.mail")
public record MailSettings(String host, Integer port, String username, String password, String from, String publicUrl) {
    public MailSettings {
        host = blankToNull(host);
        port = port == null ? 465 : port;
        username = blankToNull(username);
        // A file read through configtree may end with a line break the person did not mean as part of the password.
        password = password == null || password.isEmpty() ? null : password.replaceAll("[\r\n]+$", "");
        from = blankToNull(from);
        publicUrl = blankToNull(publicUrl) == null ? null : publicUrl.trim().replaceAll("/+$", "");
    }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    /** The mail can go out only with a server, a sender and the public address the link points to. */
    public boolean configured() {
        if (host == null || from == null || publicUrl == null) return false;
        try {
            URI uri = URI.create(publicUrl);
            return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && uri.getHost() != null;
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    @Override public String toString() {
        return "MailSettings[host=" + host + ", port=" + port + ", username=" + username + ", from=" + from
            + ", publicUrl=" + publicUrl + ", password=" + (password == null ? "none" : "hidden") + "]";
    }
}
