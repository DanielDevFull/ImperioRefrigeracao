import Image from "next/image";
import { cn } from "@/lib/utils";

/** Emblema circular do logo, com halo gelado opcional. */
export function Emblem({
  size = 40,
  halo = false,
  priority = false,
  className,
}: {
  size?: number;
  halo?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const src = size > 256 ? "/brand/emblem-768.webp" : size > 128 ? "/brand/emblem-512.webp" : "/brand/emblem-256.webp";
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size }}
    >
      {halo && (
        <span
          aria-hidden
          className="absolute -inset-[18%] rounded-full animate-breathe"
          style={{
            background:
              "radial-gradient(closest-side, rgb(56 168 255 / 0.45), rgb(56 168 255 / 0.12) 60%, transparent 75%)",
          }}
        />
      )}
      <Image
        src={src}
        alt="Imperium Tec Refrigeração"
        width={size}
        height={size}
        priority={priority}
        className="relative rounded-full"
      />
    </span>
  );
}

/** Marca nominativa: "Imperium" em Cinzel prateado e a linha de serviço em azul gelo. */
export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="font-display text-silver-brushed text-[1.35rem] font-bold tracking-[0.06em]">
        Imperium
      </span>
      {!compact && (
        <span className="mt-1 text-[0.7rem] font-medium tracking-[0.08em] text-ice">
          Tec Refrigeração
        </span>
      )}
    </span>
  );
}
