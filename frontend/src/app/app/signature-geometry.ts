/**
 * Corte 3A (R-20, R-22): the full-screen signature keeps its strokes as points in a fixed reference space, the size
 * the area had when the first stroke was drawn. Turning the phone changes the area; the strokes are redrawn with one
 * uniform scale, centred, so the signature neither disappears nor stretches.
 */
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Fit = { scale: number; offsetX: number; offsetY: number };

/** How the reference space sits in an area of another size: the largest uniform scale that fits, centred. */
export function fit(reference: Size, area: Size): Fit {
  if (reference.width <= 0 || reference.height <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.min(area.width / reference.width, area.height / reference.height);
  return {
    scale,
    offsetX: (area.width - reference.width * scale) / 2,
    offsetY: (area.height - reference.height * scale) / 2,
  };
}

/** A point of the area, in reference space (where it is stored). */
export function toReference(point: Point, f: Fit): Point {
  return { x: (point.x - f.offsetX) / f.scale, y: (point.y - f.offsetY) / f.scale };
}

/** A stored point, in the area as it is now (where it is drawn). */
export function toArea(point: Point, f: Fit): Point {
  return { x: point.x * f.scale + f.offsetX, y: point.y * f.scale + f.offsetY };
}

/** The signature limit of the server (Uploads.MAX_SIGNATURE_BYTES); it does not change in this cut. */
export const MAX_SIGNATURE_BYTES = 1024 * 1024;

/** Bytes a base64 data URL decodes to. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Widths to try when exporting, largest first: when an image does not fit in the limit the resolution goes down
 * (point 14 of the order), never the limit up. The last one is small enough for any signature.
 */
export function exportWidths(start = 1600): number[] {
  const widths: number[] = [];
  for (let width = start; width >= 400; width = Math.round(width * 0.75)) widths.push(width);
  if (widths[widths.length - 1] !== 400) widths.push(400);
  return widths;
}

/** The first rendering that fits the limit, or null if none does. */
export function firstThatFits(render: (width: number) => string, widths = exportWidths()): string | null {
  for (const width of widths) {
    const image = render(width);
    if (dataUrlBytes(image) <= MAX_SIGNATURE_BYTES) return image;
  }
  return null;
}
