import { useEffect, useRef, useState } from "react";

type SignaturePadProps = {
  onChange: (dataUrl: string | null) => void;
};

export function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function emitChange() {
    const canvas = canvasRef.current;
    if (!canvas) {
      onChange(null);
      return;
    }
    onChange(canvas.toDataURL("image/png"));
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) {
      return;
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) {
      return;
    }
    const point = getPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    if (empty) {
      setEmpty(false);
    }
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) {
      return;
    }
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
    emitChange();
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        aria-label="Unterschriftenfeld"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="signature-toolbar">
        <span>{empty ? "Noch keine Unterschrift erfasst" : "Unterschrift erfasst"}</span>
        <button className="secondary" type="button" onClick={clear}>
          Löschen
        </button>
      </div>
    </div>
  );
}
