import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-7 text-[0.68rem]",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

/** Avatar do técnico: iniciais na cor dele (a mesma da agenda). */
export function TechAvatar({
  name,
  color,
  size = "md",
  muted = false,
  className,
}: {
  name: string;
  color: string;
  size?: keyof typeof SIZES;
  muted?: boolean;
  className?: string;
}) {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#38a8ff";
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full font-semibold tracking-wide",
        SIZES[size],
        muted && "opacity-50 grayscale",
        className,
      )}
      style={{
        color: c,
        background: `radial-gradient(circle at 30% 25%, ${c}33, ${c}12 70%)`,
        boxShadow: `inset 0 0 0 1px ${c}66, 0 0 18px -6px ${c}88`,
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Placa no estilo da plaqueta do veículo. */
export function PlateTag({ plate, className }: { plate: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[5px] border border-rime bg-night px-1.5 py-0.5 font-mono text-[0.72rem] font-medium tracking-[0.08em] text-silver",
        className,
      )}
    >
      {plate}
    </span>
  );
}

export function SkillChips({ skills, max = 4, className }: { skills: string[]; max?: number; className?: string }) {
  if (!skills.length) return null;
  const shown = skills.slice(0, max);
  const rest = skills.length - shown.length;
  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((s) => (
        <li key={s} className="rounded-md bg-ice/8 px-1.5 py-0.5 text-[0.7rem] text-frost/90 ring-1 ring-inset ring-ice/15">
          {s}
        </li>
      ))}
      {rest > 0 && <li className="px-1 py-0.5 text-[0.7rem] text-steel">+{rest}</li>}
    </ul>
  );
}
