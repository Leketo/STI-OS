"use client";

import { useRef, useState } from "react";

/**
 * Conformity signed on the device at hand. Face to face the operator holds the phone and the signer
 * only types a name and draws: the signer never logs in here.
 */
export function SignaturePad({
  busy,
  onCancel,
  onSign,
}: {
  busy: boolean;
  onCancel: () => void;
  onSign: (signerName: string, signedOn: string, image: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signerName, setSignerName] = useState("");
  const [signedOn, setSignedOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [drawn, setDrawn] = useState(false);

  function context() {
    const element = canvas.current;
    return element ? element.getContext("2d") : null;
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (element.width / rect.width),
      y: (event.clientY - rect.top) * (element.height / rect.height),
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const surface = context();
    if (!surface) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    surface.lineWidth = 2.5;
    surface.lineCap = "round";
    surface.lineJoin = "round";
    surface.strokeStyle = "#0f172a";
    surface.beginPath();
    surface.moveTo(x, y);
    drawing.current = true;
    setDrawn(true);
  }

  function extend(event: React.PointerEvent<HTMLCanvasElement>) {
    const surface = context();
    if (!drawing.current || !surface) return;
    const { x, y } = point(event);
    surface.lineTo(x, y);
    surface.stroke();
  }

  function stop() {
    drawing.current = false;
  }

  function clear() {
    const element = canvas.current;
    const surface = context();
    if (element && surface)
      surface.clearRect(0, 0, element.width, element.height);
    setDrawn(false);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = canvas.current;
    if (!element || !drawn) return;
    onSign(signerName.trim(), signedOn, element.toDataURL("image/png"));
  }

  return (
    <form onSubmit={submit} className="sti-sign-form">
      <h5 className="text-sm font-bold">Firma de conformidad</h5>
      <div className="sti-field">
        <label htmlFor="signer-name" className="mb-1 block text-xs font-medium">
          Nombre de quien firma
        </label>
        <input
          id="signer-name"
          required
          maxLength={200}
          value={signerName}
          onChange={(event) => setSignerName(event.target.value)}
        />
      </div>
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
      <div>
        <p className="mb-1 text-xs font-medium">Firmá con el dedo o el lápiz</p>
        <canvas
          ref={canvas}
          width={600}
          height={200}
          aria-label="Espacio para firmar"
          className="w-full touch-none rounded-lg border border-dashed border-slate-400 bg-slate-50"
          onPointerDown={start}
          onPointerMove={extend}
          onPointerUp={stop}
          onPointerCancel={stop}
        />
      </div>
      <div className="sti-action-group">
        <button
          type="submit"
          disabled={busy || !drawn || !signerName.trim()}
          className="sti-button primary"
        >
          {busy ? "Guardando…" : "Firmar"}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={busy}
          className="sti-button secondary"
        >
          Borrar trazo
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
    </form>
  );
}
