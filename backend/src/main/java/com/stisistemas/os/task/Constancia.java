package com.stisistemas.os.task;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

/**
 * Corte 3A (R-21): the service record ("constancia") of a finished task, one A4 page. Made on demand and never kept.
 *
 * <ul>
 *   <li>The text is Inter (SIL OFL 1.1), embedded and cut down to the letters used: accents and ñ come out right.</li>
 *   <li>The logo is drawn as PDF paths from the STI S.R.L. SVG (D-218): eight shapes of one colour, nothing else.</li>
 *   <li>Every date is in Paraguay time (America/Asuncion), whatever the server's zone.</li>
 *   <li>A name that does not fit its line is cut with "…".</li>
 * </ul>
 */
public final class Constancia {
    public static final ZoneId PARAGUAY = ZoneId.of("America/Asuncion");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter HOUR = DateTimeFormatter.ofPattern("HH:mm");
    private static final String DASH = "—";
    private static final float MM = 72f / 25.4f;
    private static final float LEFT = 20 * MM, RIGHT = PDRectangle.A4.getWidth() - 20 * MM;
    private static final float WIDTH = RIGHT - LEFT;
    private static final float[] INK = {0.09f, 0.11f, 0.15f}, MUTED = {0.39f, 0.42f, 0.47f}, LINE = {0.80f, 0.82f, 0.85f};
    private static final float[] BLUE = {0f, 32 / 255f, 91 / 255f};
    private static final List<String> LOGO = logoPaths();

    public record Signature(byte[] png, String signerName, OffsetDateTime signedAt, boolean remote) {}

    public record Data(String code, String client, String project, String title, List<String> assignees,
                       OffsetDateTime requested, OffsetDateTime attended, OffsetDateTime finished, Signature signature) {}

    private Constancia() {}

    public static String fileName(String code) {
        return "constancia-" + code.replaceAll("[^A-Za-z0-9-]", "") + ".pdf";
    }

    public static byte[] render(Data data, Instant generatedAt) {
        try (var document = new PDDocument(); var out = new ByteArrayOutputStream()) {
            var info = new PDDocumentInformation();
            info.setTitle("Constancia de servicio " + data.code());
            info.setCreator("STI-OS");
            info.setProducer("STI-OS");
            document.setDocumentInformation(info);
            var page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont regular = font(document, "Inter-Regular.ttf");
            PDFont bold = font(document, "Inter-Bold.ttf");
            try (var pdf = new PDPageContentStream(document, page)) {
                var page1 = new Writer(pdf, regular, bold);
                float top = PDRectangle.A4.getHeight() - 20 * MM;
                float y = page1.header(data.code(), top);
                y = page1.rows(data, y - 34);
                y = page1.dates(data, y - 26);
                page1.conformity(document, data.signature(), y - 26);
                page1.footer(generatedAt);
            }
            document.save(out);
            return out.toByteArray();
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    static String day(OffsetDateTime instant) { return instant == null ? DASH : instant.atZoneSameInstant(PARAGUAY).format(DAY); }
    static String hour(OffsetDateTime instant) { return instant.atZoneSameInstant(PARAGUAY).format(HOUR); }
    static String moment(OffsetDateTime instant) { return instant == null ? DASH : day(instant) + " " + hour(instant); }

    /** The text, cut with "…" so that it fits the width at that size. */
    static String fit(PDFont font, float size, String text, float width) throws IOException {
        String clean = text == null ? "" : text.replaceAll("\\s+", " ").trim();
        if (font.getStringWidth(clean) / 1000 * size <= width) return clean;
        int end = clean.length();
        while (end > 0 && font.getStringWidth(clean.substring(0, end).stripTrailing() + "…") / 1000 * size > width) end--;
        return clean.substring(0, end).stripTrailing() + "…";
    }

    private static PDFont font(PDDocument document, String name) throws IOException {
        try (InputStream in = resource(name)) {
            return PDType0Font.load(document, in, true);
        }
    }

    private static InputStream resource(String name) {
        InputStream in = Constancia.class.getResourceAsStream("/constancia/" + name);
        if (in == null) throw new IllegalStateException("Missing resource /constancia/" + name);
        return in;
    }

    private static List<String> logoPaths() {
        try (InputStream in = resource("logo-azul-transparente.svg")) {
            String svg = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            List<String> paths = new ArrayList<>();
            Matcher m = Pattern.compile("<path[^>]*\\sd=\"([^\"]+)\"").matcher(svg);
            while (m.find()) paths.add(m.group(1));
            if (paths.isEmpty()) throw new IllegalStateException("The logo has no paths");
            return List.copyOf(paths);
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    /** Draws on the page, top to bottom. */
    private static final class Writer {
        final PDPageContentStream pdf;
        final PDFont regular, bold;

        Writer(PDPageContentStream pdf, PDFont regular, PDFont bold) { this.pdf = pdf; this.regular = regular; this.bold = bold; }

        void text(PDFont font, float size, float[] color, float x, float y, String text) throws IOException {
            pdf.beginText();
            pdf.setFont(font, size);
            pdf.setNonStrokingColor(color[0], color[1], color[2]);
            pdf.newLineAtOffset(x, y);
            pdf.showText(text);
            pdf.endText();
        }

        void rightText(PDFont font, float size, float[] color, float right, float y, String text) throws IOException {
            text(font, size, color, right - font.getStringWidth(text) / 1000 * size, y, text);
        }

        void rule(float y) throws IOException {
            pdf.setStrokingColor(LINE[0], LINE[1], LINE[2]);
            pdf.setLineWidth(0.8f);
            pdf.moveTo(LEFT, y);
            pdf.lineTo(RIGHT, y);
            pdf.stroke();
        }

        /** Logo (55 mm wide, within the 45 to 65 the kit asks), product line, title and number. */
        float header(String code, float top) throws IOException {
            float logoWidth = 55 * MM, scale = logoWidth / 1320f, logoHeight = 230 * scale;
            logo(LEFT, top - logoHeight, scale);
            text(regular, 9, MUTED, LEFT, top - logoHeight - 16, "Órdenes de servicio · STI-OS");
            rightText(bold, 17, INK, RIGHT, top - 14, "Constancia de servicio");
            rightText(regular, 11, MUTED, RIGHT, top - 32, "N° " + code);
            float y = top - logoHeight - 28;
            rule(y);
            return y;
        }

        /** The SVG paths, in the PDF's upward axis; viewBox 245 302 1320 230. */
        void logo(float x, float y, float scale) throws IOException {
            pdf.saveGraphicsState();
            pdf.setNonStrokingColor(BLUE[0], BLUE[1], BLUE[2]);
            for (String d : LOGO) {
                SvgPath.draw(d, pdf, px -> (float) (x + (px - 245) * scale), py -> (float) (y + (532 - py) * scale));
                pdf.fill();
            }
            pdf.restoreGraphicsState();
        }

        float rows(Data data, float y) throws IOException {
            float labelWidth = 34 * MM, valueX = LEFT + labelWidth, valueWidth = RIGHT - valueX;
            y = row("Cliente", data.client(), y, valueX, valueWidth);
            y = row("Proyecto", data.project(), y, valueX, valueWidth);
            y = row("Tarea", data.title(), y, valueX, valueWidth);
            List<String> people = data.assignees().isEmpty() ? List.of(DASH) : data.assignees();
            text(regular, 10, MUTED, LEFT, y, people.size() == 1 ? "Responsable" : "Responsables");
            for (String person : people) {
                text(regular, 11, INK, valueX, y, fit(regular, 11, person, valueWidth));
                y -= 16;
            }
            return y;
        }

        float row(String label, String value, float y, float valueX, float valueWidth) throws IOException {
            text(regular, 10, MUTED, LEFT, y, label);
            text(bold, 11, INK, valueX, y, fit(bold, 11, value, valueWidth));
            return y - 20;
        }

        float dates(Data data, float y) throws IOException {
            rule(y + 12);
            text(bold, 11, INK, LEFT, y - 6, "Fechas (hora de Paraguay)");
            y -= 28;
            var signature = data.signature();
            y = date("Solicitud", data.requested(), "Cuando se cargó la tarea en STI-OS.", y);
            y = date("Atención", data.attended(), "La primera vez que la tarea pasó a En proceso.", y);
            y = date("Finalizada", data.finished(), "La última vez que el equipo terminó el trabajo (pasó a Finalizada).", y);
            y = date("Firma", signature == null ? null : signature.signedAt(), "Cuando se registró la firma de conformidad vigente.", y);
            return y;
        }

        float date(String label, OffsetDateTime when, String meaning, float y) throws IOException {
            float valueX = LEFT + 34 * MM;
            text(regular, 10, MUTED, LEFT, y, label);
            text(bold, 11, INK, valueX, y, moment(when));
            text(regular, 8.5f, MUTED, valueX, y - 12, fit(regular, 8.5f, meaning, RIGHT - valueX));
            return y - 30;
        }

        void conformity(PDDocument document, Signature signature, float y) throws IOException {
            rule(y + 12);
            text(bold, 11, INK, LEFT, y - 6, "Conformidad");
            float boxTop = y - 18, boxHeight = 44 * MM, boxWidth = 100 * MM;
            pdf.setStrokingColor(LINE[0], LINE[1], LINE[2]);
            pdf.setLineWidth(0.8f);
            pdf.addRect(LEFT, boxTop - boxHeight, boxWidth, boxHeight);
            pdf.stroke();
            float below = boxTop - boxHeight - 16;
            if (signature != null) {
                var image = PDImageXObject.createFromByteArray(document, signature.png(), "firma");
                float pad = 6, room = boxWidth - 2 * pad, roomH = boxHeight - 2 * pad;
                float scale = Math.min(room / image.getWidth(), roomH / image.getHeight());
                float w = image.getWidth() * scale, h = image.getHeight() * scale;
                pdf.drawImage(image, LEFT + (boxWidth - w) / 2, boxTop - boxHeight + (boxHeight - h) / 2, w, h);
                text(regular, 10, INK, LEFT, below, fit(regular, 10, "Aclaración: " + signature.signerName(), WIDTH));
                text(regular, 10, MUTED, LEFT, below - 15, "Firmó el " + day(signature.signedAt()) + " a las " + hour(signature.signedAt())
                    + " · " + (signature.remote() ? "A distancia" : "Presencial"));
            } else {
                // No current signature: a blank box to sign on paper, with its two lines.
                lineWithLabel(LEFT + 8, boxTop - boxHeight + 30, boxWidth - 16, "Firma");
                lineWithLabel(LEFT, below - 18, boxWidth, "Aclaración");
            }
        }

        void lineWithLabel(float x, float y, float width, String label) throws IOException {
            pdf.setStrokingColor(MUTED[0], MUTED[1], MUTED[2]);
            pdf.setLineWidth(0.6f);
            pdf.moveTo(x, y);
            pdf.lineTo(x + width, y);
            pdf.stroke();
            text(regular, 9, MUTED, x, y - 12, label);
        }

        void footer(Instant generatedAt) throws IOException {
            float y = 14 * MM;
            rule(y + 12);
            var at = generatedAt.atZone(PARAGUAY);
            text(regular, 8.5f, MUTED, LEFT, y, "Generado por STI-OS el " + at.format(DAY) + " a las " + at.format(HOUR));
            rightText(regular, 8.5f, MUTED, RIGHT, y, "Página 1 de 1");
        }
    }
}
