package com.stisistemas.os;

import static org.assertj.core.api.Assertions.assertThat;

import com.stisistemas.os.task.Constancia;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

/**
 * CA-52, the part that needs no database: the page itself, with fake data. It also leaves the two sample PDFs
 * (signed and unsigned) in target/constancia-ejemplo/, to be copied as evidence.
 */
class ConstanciaRenderTest {
    // Paraguay is UTC-3 (all year since October 2024, and in November also before): 12:00Z is 09:00 there.
    static final OffsetDateTime REQUESTED = OffsetDateTime.parse("2026-11-18T12:00:00Z");
    static final OffsetDateTime ATTENDED = OffsetDateTime.parse("2026-11-19T14:05:00Z");
    static final OffsetDateTime FINISHED = OffsetDateTime.parse("2026-11-20T14:05:00Z");
    static final OffsetDateTime SIGNED = OffsetDateTime.parse("2026-11-21T02:30:00Z"); // 23:30 of the 20th in Paraguay
    static final List<String> FIVE = List.of("José Peña", "María Ñandutí Benítez", "Ángel Núñez", "Lucía Ibáñez",
        "Bartolomé de las Casas Fernández de Córdoba y Valenzuela Sotomayor de Irala Martínez y Garay Sanabria");

    static Constancia.Data data(Constancia.Signature signature, List<String> people) {
        return new Constancia.Data("TAR-0042", "Ñandutí Asunción S.A. (datos falsos)",
            "Torre Norte — CCTV, cableado estructurado del obrador, sala de máquinas y estacionamiento del subsuelo dos y tres",
            "Instalar 4 cámaras domo en el piso 3 y configurar la grabación por 30 días", people,
            REQUESTED, ATTENDED, FINISHED, signature);
    }

    @Test void theSignedPageSaysEverythingInParaguayTimeWithAccentsAndCutsWhatDoesNotFit() throws Exception {
        var signature = new Constancia.Signature(png(), "José Peña", SIGNED, false);
        byte[] pdf = Constancia.render(data(signature, FIVE), Instant.parse("2026-11-21T10:00:00Z"));
        save("constancia-ejemplo-firmada.pdf", pdf);
        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertThat(document.getNumberOfPages()).isEqualTo(1);
            String text = new PDFTextStripper().getText(document);
            assertThat(text).contains("Órdenes de servicio · STI-OS", "Constancia de servicio", "N° TAR-0042",
                "Ñandutí Asunción S.A.", "José Peña", "María Ñandutí Benítez", "Ángel Núñez", "Lucía Ibáñez", "Responsables",
                "Solicitud", "18/11/2026 09:00", "Atención", "19/11/2026 11:05", "Finalizada", "20/11/2026 11:05",
                "Firma", "20/11/2026 23:30", "Aclaración: José Peña", "Firmó el 20/11/2026 a las 23:30 · Presencial",
                "Generado por STI-OS el 21/11/2026 a las 07:00", "Página 1 de 1");
            // The long project and the long fifth name are cut with an ellipsis, not run off the page.
            assertThat(text).contains("…").doesNotContain("subsuelo dos y tres").doesNotContain("Garay Sanabria");
            assertThat(text).contains("Bartolomé de las Casas");
            assertThat(images(document)).as("only the signature is an image: the logo is vectors").isEqualTo(1);
            assertThat(fonts(document)).allMatch(name -> name.contains("Inter")).isNotEmpty();
            assertThat(document.getDocumentInformation().getTitle()).isEqualTo("Constancia de servicio TAR-0042");
        }
    }

    @Test void withoutASignatureTheBoxIsBlankWithItsTwoLinesAndTheDateIsADash() throws Exception {
        byte[] pdf = Constancia.render(data(null, List.of("José Peña")), Instant.parse("2026-11-21T10:00:00Z"));
        save("constancia-ejemplo-sin-firma.pdf", pdf);
        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertThat(text).contains("Responsable", "Firma", "Aclaración").doesNotContain("Responsables", "Firmó el", "Aclaración:");
            assertThat(text).containsPattern("Firma\\s+—");
            assertThat(images(document)).as("no image at all: logo in vectors and no signature").isZero();
        }
    }

    @Test void theFileNameIsTheTaskNumber() {
        assertThat(Constancia.fileName("TAR-0042")).isEqualTo("constancia-TAR-0042.pdf");
        assertThat(Constancia.fileName("TAR-0042\"; x=y")).isEqualTo("constancia-TAR-0042xy.pdf");
    }

    static int images(PDDocument document) throws Exception {
        int count = 0;
        var resources = document.getPage(0).getResources();
        for (COSName name : resources.getXObjectNames()) if (resources.isImageXObject(name)) count++;
        return count;
    }

    static List<String> fonts(PDDocument document) throws Exception {
        var resources = document.getPage(0).getResources();
        var names = new java.util.ArrayList<String>();
        for (COSName name : resources.getFontNames()) names.add(resources.getFont(name).getName());
        return names;
    }

    /** A 300×100 white PNG with a dark diagonal: a fake signature. */
    static byte[] png() throws Exception {
        var image = new java.awt.image.BufferedImage(300, 100, java.awt.image.BufferedImage.TYPE_INT_RGB);
        var g = image.createGraphics();
        g.setColor(java.awt.Color.WHITE);
        g.fillRect(0, 0, 300, 100);
        g.setColor(new java.awt.Color(15, 23, 42));
        g.setStroke(new java.awt.BasicStroke(3));
        g.drawLine(20, 80, 280, 20);
        g.dispose();
        var out = new ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    static void save(String name, byte[] pdf) throws Exception {
        Path dir = Path.of("target", "constancia-ejemplo");
        Files.createDirectories(dir);
        Files.write(dir.resolve(name), pdf);
    }
}
