"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { nativeSelectClass } from "@/components/system/form";
import { cn } from "@/lib/utils";

/** <select> que grava a escolha em um parâmetro da URL (ex.: ?categoria=gas). */
export function ParamSelect({
  param,
  options,
  placeholder,
  className,
  label,
}: {
  param: string;
  options: { value: string; label: string }[];
  placeholder: string;
  className?: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const current = params.get(param) ?? "";
  return (
    <select
      aria-label={label}
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(param, e.target.value);
        else next.delete(param);
        next.delete("page");
        start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
      }}
      className={cn(nativeSelectClass, "w-full sm:w-48", pending && "opacity-70", className)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Mostra um toast uma vez quando a página abre com ?{param}=1 e limpa o parâmetro. */
export function ToastOnArrival({ param, message }: { param: string; message: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current || params.get(param) !== "1") return;
    shown.current = true;
    toast.success(message);
    const next = new URLSearchParams(params.toString());
    next.delete(param);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [params, param, message, router, pathname]);
  return null;
}
