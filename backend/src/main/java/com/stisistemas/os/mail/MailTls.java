package com.stisistemas.os.mail;

import javax.net.ssl.SSLSocketFactory;

/**
 * Only for tests: the way to say which certificate the fake mail server is trusted with. No bean of this type
 * exists in production, where the certificate is validated against the system's trusted authorities and the host
 * name is checked, with no way around it.
 */
public interface MailTls {
    SSLSocketFactory socketFactory();
}
