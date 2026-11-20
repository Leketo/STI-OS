package com.stisistemas.os.task;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.pdfbox.pdmodel.PDPageContentStream;

/**
 * The subset of SVG path data the STI S.R.L. logo uses: absolute M, L, H, V, C and Z, with repeated coordinates.
 * Anything else is refused, so that a logo with other shapes cannot come out wrong without anyone noticing (D-218:
 * if it ever has them, the PNG goes instead).
 */
final class SvgPath {
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z]|-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?");

    private SvgPath() {}

    interface Axis { float at(double value); }

    static void draw(String d, PDPageContentStream pdf, Axis x, Axis y) throws IOException {
        List<String> tokens = new ArrayList<>();
        Matcher m = TOKEN.matcher(d);
        while (m.find()) tokens.add(m.group());
        int i = 0;
        char command = 0;
        double cx = 0, cy = 0;
        while (i < tokens.size()) {
            String token = tokens.get(i);
            if (Character.isLetter(token.charAt(0))) {
                command = token.charAt(0);
                i++;
                if (command == 'Z') { pdf.closePath(); continue; }
                if ("MLHVC".indexOf(command) < 0) throw new IllegalArgumentException("SVG command not supported: " + command);
                continue;
            }
            switch (command) {
                case 'M' -> { cx = num(tokens, i++); cy = num(tokens, i++); pdf.moveTo(x.at(cx), y.at(cy)); command = 'L'; }
                case 'L' -> { cx = num(tokens, i++); cy = num(tokens, i++); pdf.lineTo(x.at(cx), y.at(cy)); }
                case 'H' -> { cx = num(tokens, i++); pdf.lineTo(x.at(cx), y.at(cy)); }
                case 'V' -> { cy = num(tokens, i++); pdf.lineTo(x.at(cx), y.at(cy)); }
                case 'C' -> {
                    double x1 = num(tokens, i++), y1 = num(tokens, i++), x2 = num(tokens, i++), y2 = num(tokens, i++);
                    cx = num(tokens, i++); cy = num(tokens, i++);
                    pdf.curveTo(x.at(x1), y.at(y1), x.at(x2), y.at(y2), x.at(cx), y.at(cy));
                }
                default -> throw new IllegalArgumentException("Coordinates before a command in SVG path");
            }
        }
    }

    private static double num(List<String> tokens, int i) {
        if (i >= tokens.size() || Character.isLetter(tokens.get(i).charAt(0))) throw new IllegalArgumentException("SVG path cut short");
        return Double.parseDouble(tokens.get(i));
    }
}
