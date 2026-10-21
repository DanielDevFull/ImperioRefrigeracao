"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { CameraOff, Flashlight, FlashlightOff, Keyboard, Loader2, RefreshCw, ScanLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { resolveScanAction } from "../actions";

type Phase = "starting" | "scanning" | "found" | "denied" | "unavailable" | "insecure" | "error";
type Decoder = (data: Uint8ClampedArray, w: number, h: number, opts?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }) => { data: string } | null;

function haptic(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* sem suporte */
  }
}

function Bracket({ className, found }: { className: string; found: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("absolute size-11 transition-colors duration-200", found ? "text-mint" : "text-frost", className)} aria-hidden>
      <path d="M3 22V9a6 6 0 0 1 6-6h13" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}

export function Scanner() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [code, setCode] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [resolving, startResolve] = useTransition();

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const resolve = useCallback(
    async (text: string, source: "camera" | "manual") => {
      const r = await resolveScanAction(text).catch(() => ({ ok: false, error: "Sem conexão. Tente de novo quando o sinal voltar.", id: undefined }));
      if (r.ok && r.id) {
        stop();
        router.push(`/tecnico/equipamento/${r.id}`);
        return true;
      }
      if (source === "manual") setManualError(r.error ?? "Código não encontrado.");
      else {
        setMessage(r.error ?? "Etiqueta não reconhecida.");
        haptic([40, 60, 40]);
        setPhase("scanning");
      }
      return false;
    },
    [router, stop],
  );

  const start = useCallback(async () => {
    stop();
    setMessage(null);
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setPhase("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unavailable");
      return;
    }
    setPhase("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch({ supported: Boolean(caps.torch), on: false });
      setPhase("scanning");

      const jsQR = (await import("jsqr")).default as unknown as Decoder;
      canvasRef.current ??= document.createElement("canvas");
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      timerRef.current = window.setInterval(() => {
        if (busyRef.current || !ctx || video.readyState < 2 || !video.videoWidth) return;
        const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const found = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
        if (!found?.data) return;
        const now = Date.now();
        if (lastRef.current && lastRef.current.text === found.data && now - lastRef.current.at < 3000) return;
        lastRef.current = { text: found.data, at: now };
        busyRef.current = true;
        haptic(18);
        setPhase("found");
        void resolve(found.data, "camera").finally(() => {
          busyRef.current = false;
        });
      }, 200);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setPhase("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") setPhase("unavailable");
      else setPhase("error");
    }
  }, [resolve, stop]);

  useEffect(() => {
    const t = setTimeout(() => void start(), 0);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else if (!streamRef.current) void start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [start, stop]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch((t) => ({ ...t, on }));
    } catch {
      setTorch({ supported: false, on: false });
    }
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const v = code.trim();
    if (!v) {
      setManualError("Digite o código da etiqueta (ex.: EQ-00012).");
      return;
    }
    setManualError(null);
    startResolve(async () => {
      await resolve(v, "manual");
    });
  }

  const live = phase === "scanning" || phase === "found" || phase === "starting";

  return (
    <div className="space-y-5">
      <div className="relative -mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-3xl">
        <div className="relative aspect-[4/5] w-full">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={cn("absolute inset-0 size-full object-cover transition-opacity", live ? "opacity-100" : "opacity-0")}
          />

          {live && (
            <div className="absolute inset-0 grid place-items-center">
              {/* máscara escura fora do visor */}
              <div className="relative aspect-square w-[66%] rounded-[1.75rem] shadow-[0_0_0_100vmax_rgb(4_9_20/0.62)]">
                <div className="absolute inset-0 rounded-[1.75rem] ring-1 ring-frost/25 backdrop-saturate-150" />
                <motion.div
                  className="absolute -inset-1"
                  animate={phase === "found" ? { scale: 0.92 } : reduce ? {} : { scale: [1, 0.965, 1] }}
                  transition={phase === "found" ? { type: "spring", stiffness: 400, damping: 22 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Bracket found={phase === "found"} className="left-0 top-0" />
                  <Bracket found={phase === "found"} className="right-0 top-0 rotate-90" />
                  <Bracket found={phase === "found"} className="bottom-0 right-0 rotate-180" />
                  <Bracket found={phase === "found"} className="bottom-0 left-0 -rotate-90" />
                </motion.div>
                {phase === "scanning" && !reduce && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-x-5 h-0.5 rounded-full bg-gradient-to-r from-transparent via-ice to-transparent shadow-[0_0_14px_rgb(56_168_255/0.9)]"
                    initial={{ top: "12%" }}
                    animate={{ top: ["12%", "88%", "12%"] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                {(phase === "found" || phase === "starting") && (
                  <span className="absolute inset-0 grid place-items-center">
                    <Loader2 className="size-8 animate-spin text-frost" />
                  </span>
                )}
              </div>
            </div>
          )}

          {!live && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-night px-8 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-brass/12 text-brass ring-1 ring-brass/30">
                <CameraOff className="size-6" />
              </span>
              {phase === "denied" && (
                <>
                  <p className="text-base font-semibold text-silver">Sem acesso à câmera</p>
                  <p className="text-sm leading-relaxed text-steel">
                    No Android: toque no cadeado ao lado do endereço, em Permissões, e libere a Câmera.
                    <br />
                    No iPhone: Ajustes, Safari, Câmera, e escolha Permitir.
                  </p>
                </>
              )}
              {phase === "unavailable" && (
                <>
                  <p className="text-base font-semibold text-silver">Câmera indisponível</p>
                  <p className="text-sm leading-relaxed text-steel">
                    Não encontramos uma câmera livre neste aparelho. Feche outros apps que usam a câmera ou digite o código abaixo.
                  </p>
                </>
              )}
              {phase === "insecure" && (
                <>
                  <p className="text-base font-semibold text-silver">Câmera bloqueada nesta conexão</p>
                  <p className="text-sm leading-relaxed text-steel">O navegador só libera a câmera em endereço seguro (https). Digite o código abaixo.</p>
                </>
              )}
              {phase === "error" && (
                <>
                  <p className="text-base font-semibold text-silver">Não foi possível abrir a câmera</p>
                  <p className="text-sm leading-relaxed text-steel">Tente de novo ou digite o código da etiqueta abaixo.</p>
                </>
              )}
              {phase !== "insecure" && (
                <button
                  type="button"
                  onClick={() => void start()}
                  className="mt-1 inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-ice ring-1 ring-ice/30 active:bg-ice/10"
                >
                  <RefreshCw className="size-4" />
                  Tentar de novo
                </button>
              )}
            </div>
          )}

          {torch.supported && live && (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              aria-pressed={torch.on}
              aria-label={torch.on ? "Desligar lanterna" : "Ligar lanterna"}
              className={cn(
                "absolute bottom-4 right-4 grid size-12 place-items-center rounded-full backdrop-blur-md ring-1",
                torch.on ? "bg-frost text-abyss ring-frost" : "bg-abyss/60 text-silver ring-frost/30",
              )}
            >
              {torch.on ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
            </button>
          )}
        </div>
      </div>

      <div aria-live="polite" className="min-h-6 text-center">
        {message ? (
          <p className="text-sm font-medium text-brass">{message}</p>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-steel">
            <ScanLine className="size-4 text-ice" />
            {phase === "found" ? "Etiqueta lida, abrindo equipamento…" : "Aponte para a etiqueta QR do equipamento"}
          </p>
        )}
      </div>

      <form onSubmit={submitManual} className="panel space-y-3 p-4" noValidate>
        <label htmlFor="codigo" className="flex items-center gap-2 text-sm font-medium text-silver">
          <Keyboard className="size-4 text-steel" />
          Digitar código
        </label>
        <div className="flex gap-2">
          <Input
            id="codigo"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.slice(0, 80));
              if (manualError) setManualError(null);
            }}
            placeholder="EQ-00012 ou código da etiqueta"
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="go"
            aria-invalid={Boolean(manualError)}
            className="h-12 rounded-xl text-base"
          />
          <button
            type="submit"
            disabled={resolving}
            className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-b from-ice to-ice-deep px-4 text-sm font-semibold text-abyss disabled:opacity-60"
          >
            {resolving && <Loader2 className="size-4 animate-spin" />}
            Abrir
          </button>
        </div>
        {manualError ? (
          <p role="alert" className="text-sm text-gauge-red">
            {manualError}
          </p>
        ) : (
          <p className="text-xs text-steel">O código fica impresso abaixo do QR, na etiqueta do aparelho.</p>
        )}
      </form>
    </div>
  );
}
