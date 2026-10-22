"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ponto normalizado (0–1 na largura/altura) + espessura do traço em px CSS. */
export type SignaturePoint = [x: number, y: number, w: number];
export type SignatureStroke = SignaturePoint[];

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  clear: () => void;
  /** PNG transparente com tinta azul-marinho (para o relatório impresso). */
  toDataURL: () => string | null;
};

/*
 * Duas tintas: a da TELA acompanha o tema (gelo claro no escuro, azul-marinho no claro, lida da variável
 * --sig-ink do quadro) e a do PAPEL é sempre azul-marinho num PNG transparente: a assinatura salva vai para o
 * relatório impresso, que é papel branco nos dois temas.
 */
const SCREEN_INK = "#d6ecff";
const PAPER_INK = "#0b1a33";

function screenInk(el: Element | null) {
  if (!el) return SCREEN_INK;
  return getComputedStyle(el).getPropertyValue("--sig-ink").trim() || SCREEN_INK;
}
const MAX_W = 3.4;
const MIN_W = 1.2;

function segment(
  ctx: CanvasRenderingContext2D,
  s: SignatureStroke,
  i: number,
  w: number,
  h: number,
) {
  const p1 = s[i - 1];
  const p2 = s[i];
  const p0 = s[i - 2] ?? p1;
  const sx = ((p0[0] + p1[0]) / 2) * w;
  const sy = ((p0[1] + p1[1]) / 2) * h;
  const ex = ((p1[0] + p2[0]) / 2) * w;
  const ey = ((p1[1] + p2[1]) / 2) * h;
  ctx.beginPath();
  ctx.lineWidth = (p1[2] + p2[2]) / 2;
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(p1[0] * w, p1[1] * h, ex, ey);
  ctx.stroke();
}

function tail(ctx: CanvasRenderingContext2D, s: SignatureStroke, w: number, h: number) {
  if (s.length < 2) return;
  const a = s[s.length - 2];
  const b = s[s.length - 1];
  ctx.beginPath();
  ctx.lineWidth = b[2];
  ctx.moveTo(((a[0] + b[0]) / 2) * w, ((a[1] + b[1]) / 2) * h);
  ctx.lineTo(b[0] * w, b[1] * h);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, p: SignaturePoint, w: number, h: number) {
  ctx.beginPath();
  ctx.arc(p[0] * w, p[1] * h, p[2] / 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function paint(ctx: CanvasRenderingContext2D, strokes: SignatureStroke[], w: number, h: number, ink: string) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    if (s.length === 1) dot(ctx, s[0], w, h);
    for (let i = 1; i < s.length; i++) segment(ctx, s, i, w, h);
    tail(ctx, s, w, h);
  }
}

/**
 * Assinatura com o dedo: eventos de ponteiro (com pontos agrupados), curvas quadráticas suaves,
 * espessura pela velocidade (ou pela pressão da caneta) e canvas nítido em telas de alta densidade.
 */
export function SignaturePad({
  ref,
  initialStrokes,
  onChange,
  disabled = false,
  className,
}: {
  ref?: React.Ref<SignaturePadHandle>;
  initialStrokes?: SignatureStroke[] | null;
  onChange?: (strokes: SignatureStroke[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<SignatureStroke[]>(initialStrokes ?? []);
  const live = useRef<{ id: number; last: { x: number; y: number; t: number; w: number } } | null>(null);
  const box = useRef({ w: 0, h: 0 });
  const [empty, setEmpty] = useState(!(initialStrokes && initialStrokes.length));

  const ink = useRef(SCREEN_INK);

  const context = useCallback(() => canvasRef.current?.getContext("2d") ?? null, []);

  const redraw = useCallback(() => {
    const ctx = context();
    if (!ctx) return;
    ink.current = screenInk(canvasRef.current);
    const { w, h } = box.current;
    ctx.clearRect(0, 0, w, h);
    paint(ctx, strokes.current, w, h, ink.current);
  }, [context]);

  // Troca de tema com o quadro aberto (seletor ou "Automático" seguindo o aparelho): redesenha na tinta nova
  useEffect(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(redraw);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", redraw);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", redraw);
    };
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      box.current = { w: rect.width, h: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  const clear = useCallback(() => {
    strokes.current = [];
    setEmpty(true);
    redraw();
    onChange?.([]);
  }, [redraw, onChange]);

  useImperativeHandle(
    ref,
    () => ({
      isEmpty: () => strokes.current.length === 0,
      clear,
      toDataURL: () => {
        if (!strokes.current.length) return null;
        const { w, h } = box.current;
        const scale = 2;
        const out = document.createElement("canvas");
        out.width = Math.round(w * scale);
        out.height = Math.round(h * scale);
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        ctx.scale(scale, scale);
        paint(ctx, strokes.current, w, h, PAPER_INK);
        return out.toDataURL("image/png");
      },
    }),
    [clear],
  );

  function point(e: { clientX: number; clientY: number; pressure: number; pointerType: string }, t: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const last = live.current?.last;
    let width: number;
    if (e.pointerType === "pen" && e.pressure > 0) {
      width = MIN_W + e.pressure * (MAX_W + 0.6 - MIN_W);
    } else if (last) {
      const dist = Math.hypot(x - last.x, y - last.y);
      const v = dist / Math.max(1, t - last.t);
      const target = Math.max(MIN_W, Math.min(MAX_W, MAX_W - v * 1.2));
      width = last.w * 0.7 + target * 0.3;
    } else {
      width = (MAX_W + MIN_W) / 2 + 0.4;
    }
    return { x, y, t, w: width };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || live.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e, e.timeStamp);
    live.current = { id: e.pointerId, last: p };
    const { w, h } = box.current;
    strokes.current.push([[p.x / w, p.y / h, p.w]]);
    const ctx = context();
    if (ctx) {
      ctx.fillStyle = ink.current;
      dot(ctx, [p.x / w, p.y / h, p.w], w, h);
    }
    if (empty) setEmpty(false);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!live.current || e.pointerId !== live.current.id) return;
    const ctx = context();
    const s = strokes.current[strokes.current.length - 1];
    const { w, h } = box.current;
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const list = events.length ? events : [e.nativeEvent];
    if (!ctx) return;
    ctx.strokeStyle = ink.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const ev of list) {
      const p = point(ev, ev.timeStamp);
      if (Math.hypot(p.x - live.current.last.x, p.y - live.current.last.y) < 0.8) continue;
      live.current.last = p;
      s.push([p.x / w, p.y / h, p.w]);
      if (s.length >= 2) segment(ctx, s, s.length - 1, w, h);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!live.current || e.pointerId !== live.current.id) return;
    live.current = null;
    const ctx = context();
    const s = strokes.current[strokes.current.length - 1];
    if (ctx && s) {
      ctx.strokeStyle = ink.current;
      tail(ctx, s, box.current.w, box.current.h);
    }
    onChange?.(strokes.current.map((st) => st.slice()));
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-abyss/60 ring-1 ring-steel/30 [--sig-ink:#d6ecff]",
        // claro: folha branca com tinta azul-marinho, como a caneta no papel do relatório
        "light:bg-night light:shadow-[inset_0_1px_3px_var(--shade)] light:[--sig-ink:var(--silver)]",
        disabled && "opacity-60",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-label="Área de assinatura. Assine com o dedo."
        role="img"
        className="block h-48 w-full cursor-crosshair touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-10 flex items-end gap-2">
        <span className="text-lg leading-none text-steel/70">×</span>
        <span className="h-px flex-1 bg-gradient-to-r from-steel/50 via-steel/30 to-transparent" />
      </div>
      {empty && (
        <p aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-6 text-center text-sm text-steel/70 light:text-steel">
          Peça para o cliente assinar aqui
        </p>
      )}
      {!empty && !disabled && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-1.5 top-1.5 inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-steel active:bg-ice/10 active:text-frost"
        >
          <Eraser className="size-4" />
          Limpar
        </button>
      )}
    </div>
  );
}
