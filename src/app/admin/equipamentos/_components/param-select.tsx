"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { nativeSelectClass } from "@/components/system/form";
import { cn } from "@/lib/utils";

/** Select que grava a escolha num parâmetro da URL (ex.: ?tipo=). */
export function ParamSelect({
  param,
  options,
  allLabel,
  label,
  className,
}: {
  param: string;
  options: { value: string; label: string }[];
  allLabel: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className={cn("relative", className)}>
      <select
        aria-label={label}
        value={params.get(param) ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set(param, e.target.value);
          else next.delete(param);
          next.delete("page");
          start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
        }}
        className={cn(nativeSelectClass, "h-9 pr-8")}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="pointer-events-none absolute right-8 top-2.5 size-4 animate-spin text-steel" />}
    </div>
  );
}
