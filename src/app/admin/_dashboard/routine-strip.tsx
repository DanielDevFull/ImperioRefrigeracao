import { Bot } from "lucide-react";
import { addDays, todayISO, type ISODate } from "@/lib/dates";
import { formatDayMonth, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RoutineStatus } from "./queries";
import { RunRoutineButton } from "./run-routine-button";
import { plural } from "./util";

function whenLabel(at: Date, today: ISODate) {
  const day = todayISO(at);
  const d = day === today ? "hoje" : day === addDays(today, -1) ? "ontem" : `em ${formatDayMonth(day)}`;
  return `${d} às ${formatTime(at)}`;
}

function generatedSentence(oms: number, invoices: number) {
  if (!oms && !invoices) return "Nada novo para gerar: agenda e mensalidades já estavam em dia";
  const parts = [
    oms ? `${oms} ${plural(oms, "OM", "OMs")}` : null,
    invoices ? `${invoices} ${plural(invoices, "mensalidade", "mensalidades")}` : null,
  ].filter(Boolean);
  const generated = oms + invoices === 1 ? "gerada" : "geradas";
  return `${parts.join(" e ")} ${generated}`;
}

export function RoutineStrip({ data, today, className }: { data: RoutineStatus; today: ISODate; className?: string }) {
  const { lastRunAt, run, summary, failure, stale, running } = data;
  const at = run?.finishedAt ?? run?.startedAt ?? lastRunAt;
  const errors = summary?.erros?.length ?? 0;
  const failed = Boolean(failure) || run?.ok === false;
  const manual = run?.triggeredBy?.startsWith("manual");

  const tone = failed ? "red" : stale ? "brass" : "mint";
  const facts = summary
    ? [
        { label: "Equipamentos verificados", value: summary.equipamentosVerificados ?? 0, show: true },
        { label: "Solicitações de compra", value: summary.solicitacoesCompra ?? 0, show: true },
        { label: "OMs sem técnico", value: summary.omsSemTecnico ?? 0, show: (summary.omsSemTecnico ?? 0) > 0 },
        {
          label: "Bloqueados por inadimplência",
          value: summary.bloqueadosPorInadimplencia ?? 0,
          show: (summary.bloqueadosPorInadimplencia ?? 0) > 0,
        },
        { label: "Com erro na geração", value: errors, show: errors > 0, red: true },
      ].filter((f) => f.show)
    : [];

  return (
    <section className={cn("panel px-5 py-4", className)} aria-label="Rotina automática">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
            tone === "mint" && "bg-mint/8 ring-mint/20 text-mint",
            tone === "brass" && "bg-brass/10 ring-brass/25 text-brass",
            tone === "red" && "bg-gauge-red/10 ring-gauge-red/25 text-gauge-red",
          )}
        >
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {!at ? (
            <>
              <p className="text-sm text-silver">A rotina diária ainda não rodou</p>
              <p className="mt-0.5 text-xs text-steel">
                Ela gera as mensalidades, as OMs preventivas e as solicitações de reposição de estoque.
              </p>
            </>
          ) : running ? (
            <>
              <p className="text-sm text-silver">Rotina diária rodando agora</p>
              <p className="mt-0.5 text-xs text-steel">Começou {run ? whenLabel(new Date(run.startedAt), today) : "agora"}.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-silver">
                {manual ? "Última rotina, rodada manualmente" : "Última rotina automática"}:{" "}
                <span className="whitespace-nowrap">{whenLabel(new Date(at), today)}</span>
              </p>
              {failure ? (
                <p className="mt-0.5 text-xs text-gauge-red">Falhou: {failure}</p>
              ) : summary ? (
                <p className="mt-0.5 text-xs text-steel">
                  {generatedSentence(summary.oms ?? 0, summary.mensalidades ?? 0)}
                </p>
              ) : null}
              {stale && (
                <p className="mt-1.5 text-xs text-brass">
                  Passou mais de um dia sem rodar. Confira o agendamento diário ou rode agora.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {facts.length > 0 && !running && (
        <dl className="mt-3.5 space-y-1.5 border-t border-rime pt-3.5">
          {facts.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-4 text-xs">
              <dt className="text-steel">{f.label}</dt>
              <dd className={cn("readout font-medium", f.red ? "text-gauge-red" : "text-silver")}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-rime pt-3.5">
        <p className="text-xs text-steel">Roda sozinha todo dia às 6h</p>
        <RunRoutineButton />
      </div>
    </section>
  );
}
