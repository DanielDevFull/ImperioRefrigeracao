import { cn } from "@/lib/utils";

/** Anel de progresso do checklist (x/y no centro). */
export function ProgressRing({
  done,
  total,
  size = 44,
  stroke = 4,
  className,
  label = true,
}: {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
  className?: string;
  label?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total ? Math.min(1, done / total) : 0;
  const complete = total > 0 && done >= total;
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={total ? `Checklist: ${done} de ${total} itens` : "Sem checklist"}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {/* trilho: no claro o véu de rime some no branco; glacier-2 é o gelo opaco visível no cartão e na página */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-[rgb(148_190_255/0.14)] light:stroke-glacier-2"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={complete ? "var(--mint)" : "var(--ice)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.16,1,0.3,1), stroke 300ms" }}
        />
      </svg>
      {label && (
        <span
          className={cn(
            "readout absolute text-[0.68rem] font-semibold",
            complete ? "text-mint" : "text-silver",
            size >= 64 && "text-sm",
          )}
        >
          {total ? `${done}/${total}` : "—"}
        </span>
      )}
    </span>
  );
}
