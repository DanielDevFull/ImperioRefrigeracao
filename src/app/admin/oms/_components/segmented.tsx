"use client";

import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const ACTIVE: Record<Tone, string> = {
  ice: "bg-ice/15 text-ice ring-ice/40",
  frost: "bg-frost/12 text-frost ring-frost/35",
  mint: "bg-mint/12 text-mint ring-mint/40",
  brass: "bg-brass/12 text-brass ring-brass/40",
  red: "bg-gauge-red/12 text-gauge-red ring-gauge-red/45",
  steel: "bg-steel/12 text-silver ring-steel/40",
  violet: "bg-violet/12 text-violet ring-violet/40",
};

/** Grupo de opções em pílulas (rádio nativo, entra no FormData pelo `name`). */
export function Segmented({
  name,
  legend,
  options,
  value,
  onChange,
  className,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string; tone?: Tone }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("space-y-1.5", className)}>
      <legend className="mb-1.5 text-sm font-medium text-silver">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative inline-flex h-8 cursor-pointer items-center rounded-full px-3.5 text-sm ring-1 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-frost",
                checked ? ACTIVE[o.tone ?? "ice"] : "text-steel ring-rime hover:text-silver hover:ring-ice/25",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
