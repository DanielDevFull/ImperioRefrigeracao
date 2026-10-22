"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

type Density = "whisper" | "calm" | "blizzard";

type Flake = {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  phase: number;
  layer: 0 | 1 | 2;
  alpha: number;
  rot: number;
  vrot: number;
  crystal: boolean;
};

const DENSITY: Record<Density, number> = {
  whisper: 0.000035,
  calm: 0.00008,
  blizzard: 0.00017,
};

const LAYER = [
  { r: [0.5, 1.1], speed: [0.18, 0.35], alpha: [0.25, 0.45] },
  { r: [1.1, 1.9], speed: [0.35, 0.6], alpha: [0.4, 0.65] },
  { r: [2.0, 3.6], speed: [0.6, 1.05], alpha: [0.6, 0.9] },
] as const;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Cores da neve vêm do CSS (--snow-*), que muda com o tema (e nas ilhas .force-dark). */
type SnowColors = { core: string; mid: string; fade: string; crystal: string; glow: string };

function readSnowColors(el: Element): SnowColors {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    core: v("--snow-core", "rgba(240, 249, 255, 1)"),
    mid: v("--snow-mid", "rgba(200, 232, 255, 0.85)"),
    fade: v("--snow-fade", "rgba(120, 190, 255, 0)"),
    crystal: v("--snow-crystal", "rgba(225, 242, 255, 0.95)"),
    glow: v("--snow-glow", "rgba(120, 200, 255, 0.9)"),
  };
}

/** Sprite de cristal de gelo (seis braços com ramificações) desenhado uma vez. */
function makeCrystalSprite(size: number, colors: SnowColors) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const mid = size / 2;
  const arm = size * 0.42;
  g.translate(mid, mid);
  g.strokeStyle = colors.crystal;
  g.lineCap = "round";
  g.shadowColor = colors.glow;
  g.shadowBlur = size * 0.12;
  for (let i = 0; i < 6; i++) {
    g.save();
    g.rotate((Math.PI / 3) * i);
    g.lineWidth = size * 0.045;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -arm);
    g.stroke();
    g.lineWidth = size * 0.035;
    for (const t of [0.45, 0.7]) {
      const b = arm * (1 - t) * 0.55;
      g.beginPath();
      g.moveTo(0, -arm * t);
      g.lineTo(-b, -arm * t - b);
      g.moveTo(0, -arm * t);
      g.lineTo(b, -arm * t - b);
      g.stroke();
    }
    g.restore();
  }
  return c;
}

/** Sprite de floco macio (ponto com brilho). */
function makeDotSprite(size: number, colors: SnowColors) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, colors.core);
  grad.addColorStop(0.35, colors.mid);
  grad.addColorStop(1, colors.fade);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * Neve em movimento: três camadas de profundidade, vento que segue o cursor
 * e cristais de gelo na camada mais próxima. Pausa fora da tela e respeita
 * "reduzir movimento" (desenha um quadro estático).
 */
export function SnowField({
  density = "calm",
  interactive = true,
  crystals = true,
  className,
}: {
  density?: Density;
  interactive?: boolean;
  crystals?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolved } = useTheme();
  // troca só os sprites quando o tema muda, sem reiniciar a neve que já está caindo
  const spritesRef = useRef<{ crystal: HTMLCanvasElement; dot: HTMLCanvasElement } | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!spritesRef.current || !canvasRef.current) return;
    const colors = readSnowColors(canvasRef.current);
    spritesRef.current = { crystal: makeCrystalSprite(64, colors), dot: makeDotSprite(32, colors) };
    redrawRef.current?.();
  }, [resolved]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    // Sem animação contínua com "reduzir movimento", economia de dados ou aparelho fraco
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      Boolean(conn?.saveData) ||
      (navigator.hardwareConcurrency ?? 8) <= 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const colors = readSnowColors(canvas);
    spritesRef.current = { crystal: makeCrystalSprite(64, colors), dot: makeDotSprite(32, colors) };

    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let raf = 0;
    let running = true;
    let visible = true;
    let wind = 0;
    let windTarget = 0;
    let t = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    const spawn = (atTop: boolean): Flake => {
      const roll = Math.random();
      const layer = (roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2) as 0 | 1 | 2;
      const spec = LAYER[layer];
      return {
        x: rand(-20, width + 20),
        y: atTop ? rand(-40, -5) : rand(0, height),
        r: rand(spec.r[0], spec.r[1]),
        vy: rand(spec.speed[0], spec.speed[1]),
        sway: rand(0.2, 0.9),
        phase: rand(0, Math.PI * 2),
        layer,
        alpha: rand(spec.alpha[0], spec.alpha[1]),
        rot: rand(0, Math.PI * 2),
        vrot: rand(-0.01, 0.01),
        crystal: crystals && layer === 2 && Math.random() < 0.35,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(420, Math.round(width * height * DENSITY[density]));
      if (flakes.length > target) flakes = flakes.slice(0, target);
      while (flakes.length < target) flakes.push(spawn(false));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const { crystal: crystalSprite, dot: dotSprite } = spritesRef.current!;
      for (const f of flakes) {
        ctx.globalAlpha = f.alpha;
        if (f.crystal) {
          const s = f.r * 5;
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          ctx.drawImage(crystalSprite, -s / 2, -s / 2, s, s);
          ctx.restore();
        } else {
          const s = f.r * 4;
          ctx.drawImage(dotSprite, f.x - s / 2, f.y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    };

    const step = () => {
      if (!running) return;
      t += 1;
      // rajadas suaves + influência do cursor
      const gust = Math.sin(t * 0.0021) * 0.35 + Math.sin(t * 0.00053 + 1.3) * 0.25;
      wind += (windTarget + gust - wind) * 0.02;

      for (const f of flakes) {
        const depth = 0.4 + f.layer * 0.45;
        f.phase += 0.01 + f.layer * 0.004;
        f.y += f.vy;
        f.x += Math.sin(f.phase) * f.sway * 0.35 + wind * depth;
        f.rot += f.vrot;

        if (interactive && pointer.active) {
          const dx = f.x - pointer.x;
          const dy = f.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          const radius = 110;
          if (d2 < radius * radius) {
            const d = Math.sqrt(d2) || 1;
            const force = ((radius - d) / radius) * (0.9 + f.layer * 0.4);
            f.x += (dx / d) * force;
            f.y += (dy / d) * force * 0.6;
          }
        }

        if (f.y > height + 10 || f.x < -40 || f.x > width + 40) {
          Object.assign(f, spawn(true));
          if (wind > 0.4) f.x = rand(-40, width * 0.7);
          if (wind < -0.4) f.x = rand(width * 0.3, width + 40);
        }
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (reduced || raf || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = pointer.y >= 0 && pointer.y <= rect.height;
      windTarget = ((pointer.x / Math.max(1, rect.width)) - 0.5) * 1.6;
    };
    const onPointerLeave = () => {
      pointer.active = false;
      windTarget = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);

    resize();
    if (reduced) draw();
    else start();
    // neve parada (reduzir movimento) precisa ser redesenhada quando o tema muda
    redrawRef.current = () => {
      if (reduced) draw();
    };

    if (interactive && !reduced) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      redrawRef.current = null;
    };
  }, [density, interactive, crystals]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
