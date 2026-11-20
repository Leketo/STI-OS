"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { paraguayDate } from "./task-model";
import {
  firstThatFits,
  fit,
  toArea,
  toReference,
  type Point,
  type Size,
} from "./signature-geometry";

/** What the full screen hands back: the strokes (to sign again on top of them) and the image that goes out. */
type Draft = {
  strokes: Point[][];
  reference: Size;
  signerName: string;
  image: string;
};

const INK = "#0f172a";
/** Line width in reference pixels; it scales with the drawing. */
const LINE = 2.6;

/**
 * Conformity signed on the device at hand. Face to face the operator holds the phone and the signer only draws and
 * types the clarification (aclaración): the signer never logs in here. Corte 3A (R-20, R-22): in the panel only the
 * date and a button; the signature itself opens in full screen.
 */
export function SignaturePad({
  code,
  busy,
  error,
  onCancel,
  onSign,
}: {
  code: string;
  busy: boolean;
  /** QA-002 and N-43: why signing was refused, shown next to "Firmar" and nowhere else. */
  error?: string;
  onCancel: () => void;
  onSign: (signerName: string, signedOn: string, image: string) => void;
}) {
  const [signedOn, setSignedOn] = useState(() => paraguayDate());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [full, setFull] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    onSign(draft.signerName.trim(), signedOn, draft.image);
  }

  return (
    <form onSubmit={submit} className="sti-sign-form">
      <h5 className="text-sm font-bold">Firma de conformidad</h5>
      <div className="sti-field">
        <label htmlFor="signed-on" className="mb-1 block text-xs font-medium">
          Fecha
        </label>
        <input
          id="signed-on"
          type="date"
          required
          value={signedOn}
          onChange={(event) => setSignedOn(event.target.value)}
        />
      </div>
      {draft ? (
        <div className="sti-sign-result">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn on this device */}
          <img src={draft.image} alt={`Firma de ${draft.signerName}`} />
          <p>
            Aclaración: <strong>{draft.signerName}</strong>
          </p>
          <button
            type="button"
            className="sti-link-button"
            disabled={busy}
            onClick={() => setFull(true)}
          >
            Volver a firmar o corregir la aclaración
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="sti-sign-open"
          disabled={busy}
          onClick={() => setFull(true)}
        >
          <strong>Tocá para firmar</strong>
          <span>Se abre en pantalla completa, con la aclaración</span>
        </button>
      )}
      <div className="sti-action-group">
        <button
          type="submit"
          disabled={busy || !draft}
          className="sti-button primary"
        >
          {busy ? "Guardando…" : "Firmar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="sti-button secondary"
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" className="sti-inline-message">
          {error}
        </p>
      )}
      {full && (
        <SignatureScreen
          code={code}
          signedOn={signedOn}
          initial={draft}
          onClose={() => setFull(false)}
          onDone={(next) => {
            setDraft(next);
            setFull(false);
          }}
        />
      )}
    </form>
  );
}

function displayDate(isoDay: string) {
  const [year, month, day] = isoDay.split("-");
  return year && month && day ? `${day}/${month}/${year}` : isoDay;
}

/** The whole window: header, a large area with a guide line, the clarification and Borrar / Listo. */
function SignatureScreen({
  code,
  signedOn,
  initial,
  onClose,
  onDone,
}: {
  code: string;
  signedOn: string;
  initial: Draft | null;
  onClose: () => void;
  onDone: (draft: Draft) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>(initial?.strokes.map((s) => [...s]) ?? []);
  const reference = useRef<Size | null>(initial?.reference ?? null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(!!initial?.strokes.length);
  const [signerName, setSignerName] = useState(initial?.signerName ?? "");
  const [failure, setFailure] = useState("");

  const current = useCallback(() => {
    const box = area.current?.getBoundingClientRect();
    return { width: box?.width ?? 0, height: box?.height ?? 0 };
  }, []);

  /** Sizes the canvas to the area as it is now and draws every stroke again. */
  const redraw = useCallback(() => {
    const element = canvas.current;
    if (!element) return;
    const size = current();
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(size.width * ratio));
    element.height = Math.max(1, Math.round(size.height * ratio));
    const surface = element.getContext("2d");
    if (!surface) return;
    surface.setTransform(ratio, 0, 0, ratio, 0, 0);
    surface.clearRect(0, 0, size.width, size.height);
    if (!reference.current) reference.current = size;
    paint(surface, strokes.current, fit(reference.current, size));
  }, [current]);

  // Rotating the phone or resizing the window keeps the strokes (point 12 of the order).
  useLayoutEffect(() => {
    redraw();
    const observer = new ResizeObserver(() => redraw());
    if (area.current) observer.observe(area.current);
    return () => observer.disconnect();
  }, [redraw]);

  // The page below does not scroll, and Escape closes without saving, as the X.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function local(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    const size = { width: box.width, height: box.height };
    if (!reference.current) reference.current = size;
    return toReference(
      { x: event.clientX - box.left, y: event.clientY - box.top },
      fit(reference.current, size),
    );
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    strokes.current.push([local(event)]);
    drawing.current = true;
    setDrawn(true);
    setFailure("");
    redraw();
  }

  function extend(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    strokes.current[strokes.current.length - 1].push(local(event));
    redraw();
  }

  function stop() {
    drawing.current = false;
  }

  function clear() {
    strokes.current = [];
    setDrawn(false);
    redraw();
  }

  function done() {
    const ref = reference.current;
    if (!ref || !strokes.current.length || !signerName.trim()) return;
    const image = firstThatFits((width) => exportImage(strokes.current, ref, width));
    if (!image) {
      setFailure("La firma quedó demasiado pesada. Borrala y volvé a firmar.");
      return;
    }
    onDone({
      strokes: strokes.current.map((s) => [...s]),
      reference: ref,
      signerName: signerName.trim(),
      image,
    });
  }

  return createPortal(
    <div
      className="sti-sign-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sti-sign-screen-title"
    >
      <header className="sti-sign-screen-head">
        <div>
          <h2 id="sti-sign-screen-title">Firma de conformidad</h2>
          <p>
            {code} · {displayDate(signedOn)}
          </p>
        </div>
        <button
          type="button"
          className="sti-icon-button"
          aria-label="Cerrar sin guardar"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </header>
      <p className="sti-sign-rotate">Girá el teléfono para tener más espacio</p>
      <div className="sti-sign-screen-body">
        <div className="sti-sign-area" ref={area}>
          <canvas
            ref={canvas}
            aria-label="Espacio para firmar"
            className="touch-none"
            onPointerDown={start}
            onPointerMove={extend}
            onPointerUp={stop}
            onPointerCancel={stop}
          />
          <div className="sti-sign-guide" aria-hidden="true">
            <span />
            <small>Firmá sobre la línea con el dedo o el lápiz</small>
          </div>
        </div>
        <div className="sti-sign-side">
          <div className="sti-field">
            <label htmlFor="signer-clarification">Aclaración</label>
            <input
              id="signer-clarification"
              maxLength={200}
              autoComplete="off"
              value={signerName}
              onChange={(event) => setSignerName(event.target.value)}
              placeholder="Nombre y apellido de quien firma"
            />
          </div>
          {failure && (
            <p role="alert" className="sti-inline-message">
              {failure}
            </p>
          )}
          <div className="sti-sign-buttons">
            <button
              type="button"
              className="sti-button secondary"
              onClick={clear}
              disabled={!drawn}
            >
              Borrar
            </button>
            <button
              type="button"
              className="sti-button primary"
              onClick={done}
              disabled={!drawn || !signerName.trim()}
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>,
    // Inside the workspace, where the day and night colours are defined; fixed, it covers the whole window.
    document.querySelector<HTMLElement>(".sti-workspace") ?? document.body,
  );
}

function paint(
  surface: CanvasRenderingContext2D,
  strokes: Point[][],
  f: ReturnType<typeof fit>,
) {
  surface.lineCap = "round";
  surface.lineJoin = "round";
  surface.strokeStyle = INK;
  surface.fillStyle = INK;
  surface.lineWidth = LINE * f.scale;
  for (const stroke of strokes) {
    const first = toArea(stroke[0], f);
    if (stroke.length === 1) {
      surface.beginPath();
      surface.arc(first.x, first.y, surface.lineWidth / 2, 0, Math.PI * 2);
      surface.fill();
      continue;
    }
    surface.beginPath();
    surface.moveTo(first.x, first.y);
    for (const point of stroke.slice(1)) {
      const p = toArea(point, f);
      surface.lineTo(p.x, p.y);
    }
    surface.stroke();
  }
}

/**
 * The image that is sent, ink on white, at a given width: the box around the strokes with a margin, so a stroke
 * drawn after turning the phone (outside the first area) is not cut.
 */
function exportImage(strokes: Point[][], reference: Size, width: number) {
  const box = signatureBox(strokes, reference);
  const moved = strokes.map((s) => s.map((p) => ({ x: p.x - box.x, y: p.y - box.y })));
  const out = document.createElement("canvas");
  out.width = width;
  out.height = Math.max(1, Math.round((box.height / box.width) * width));
  const surface = out.getContext("2d");
  if (!surface) return "";
  surface.fillStyle = "#ffffff";
  surface.fillRect(0, 0, out.width, out.height);
  paint(surface, moved, fit(box, { width: out.width, height: out.height }));
  return out.toDataURL("image/png");
}

/** The strokes' box with a margin, never smaller than a quarter of the area's height (a short scribble reads). */
function signatureBox(strokes: Point[][], reference: Size) {
  const xs = strokes.flat().map((p) => p.x);
  const ys = strokes.flat().map((p) => p.y);
  const margin = Math.max(12, 0.06 * reference.width);
  let x = Math.min(...xs) - margin, y = Math.min(...ys) - margin;
  const width = Math.max(...xs) + margin - x;
  let height = Math.max(...ys) + margin - y;
  const least = Math.max(reference.height / 4, width / 4);
  if (height < least) { y -= (least - height) / 2; height = least; }
  x = Math.floor(x); y = Math.floor(y);
  return { x, y, width: Math.ceil(width), height: Math.ceil(height) };
}
