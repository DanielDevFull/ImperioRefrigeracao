"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Linha de tabela que abre o detalhe ao clicar. O link real fica numa célula
 * (acessível por teclado); cliques em links, botões e caixas de seleção internos são preservados.
 */
export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <TableRow
      className={cn("cursor-pointer border-rime hover:bg-ice/[0.04]", className)}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a,button,input,label,[role=checkbox]")) return;
        if (window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
      onMouseEnter={() => router.prefetch(href)}
    >
      {children}
    </TableRow>
  );
}
