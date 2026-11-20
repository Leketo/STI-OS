package com.stisistemas.os;

import java.io.IOException;
import java.io.Writer;
import org.apache.catalina.connector.Request;
import org.apache.catalina.connector.Response;
import org.apache.catalina.valves.ErrorReportValve;

/**
 * QA-003: what the servlet container answers by itself, before the application sees the request (a malformed
 * address, a request line it refuses). Tomcat's own page is English HTML that names the tool; this one writes the
 * application's JSON, with only the status and no detail. Everything the application does see is answered by
 * {@link ApiErrors} and {@link ErrorJson}.
 */
public class JsonErrorReportValve extends ErrorReportValve {
    public JsonErrorReportValve() {
        setShowReport(false);
        setShowServerInfo(false);
    }

    @Override
    protected void report(Request request, Response response, Throwable throwable) {
        int status = response.getStatus();
        // The same conditions the container's own page keeps: nothing on success, nothing over a body already written.
        if (status < 400 || response.getContentWritten() > 0 || !response.setErrorReported()) return;
        try {
            Writer writer = response.getReporter();
            if (writer == null) return;
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            writer.write("{\"status\":" + status + "}");
            response.finishResponse();
        } catch (IOException | IllegalStateException unreachable) {
            // The connection is gone or the response is already committed: there is nobody left to tell.
        }
    }
}
