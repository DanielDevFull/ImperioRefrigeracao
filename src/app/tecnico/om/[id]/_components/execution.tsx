"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { FrostBurst } from "@/components/brand/frost-burst";
import { PriorityBadge, WorkOrderStatusBadge, WorkOrderTypeBadge } from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { compressImage } from "@/lib/offline/image";
import { flushOutbox, getOutboxItems, onOutboxEvent, pendingPayload, submit, useOutbox } from "@/lib/offline/outbox";
import { formatDate, formatDateTime, formatDayMonth, formatOM, formatTime } from "@/lib/format";
import type { WorkOrderStatus } from "@/server/core/work-order-flow";
import { OUTBOX_KIND, taskKey } from "../../../_lib/outbox-handlers";
import type { CompleteState, PhotoPayload, PhotoState, StatusPayload, TaskPayload, TechState } from "../../../_lib/types";
import { ProgressRing } from "../../../_components/progress-ring";
import { completeAction } from "../actions";
import { getPosition, haptic, isOnline, warmPosition } from "../_lib/device";
import { clearDraft } from "../_lib/draft";
import type { ExecTask, ExecutionData } from "../_lib/types";
import { ActionBar, primaryFor, type SuccessInfo } from "./action-bar";
import { Checklist, type TaskPatch } from "./checklist";
import { ConclusionSheet, type ConcludeOutcome, type ConclusionForm } from "./conclusion-sheet";
import { Materials } from "./materials";
import { MoreSheet } from "./more-sheet";
import { Photos, type PhotoKind } from "./photos";

const WORKING = new Set(["em_execucao", "pausada"]);
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

function Section({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <h2 id={`${id}-title`} className="font-display text-silver-brushed text-xl font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Execution({ data, children }: { data: ExecutionData; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const outbox = useOutbox();
  const scoped = outbox.items.filter((i) => i.scope === data.id);
  const reportHref = `/relatorios/om/${data.id}`;

  /* ── Status efetivo: fila offline > otimista > servidor ── */
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [seenStatus, setSeenStatus] = useState(data.status);
  if (seenStatus !== data.status) {
    setSeenStatus(data.status);
    setOptimisticStatus(null);
  }
  const queuedStatus = [...scoped].reverse().find((i) => i.kind === OUTBOX_KIND.status)?.payload as StatusPayload | undefined;
  const status = queuedStatus?.to ?? optimisticStatus ?? data.status;
  const closed = status === "concluida" || status === "cancelada";

  /* ── Checklist efetivo ── */
  const [overrides, setOverrides] = useState<Record<string, TaskPatch>>({});
  const [seenTasks, setSeenTasks] = useState(data.tasks);
  if (seenTasks !== data.tasks) {
    setSeenTasks(data.tasks);
    setOverrides({});
  }
  const tasks: ExecTask[] = data.tasks.map((t) => {
    const q = pendingPayload<TaskPayload>(outbox.items, taskKey(t.id));
    if (q) return { ...t, done: q.done, measurementValue: q.measurementValue, notes: q.notes };
    const o = overrides[t.id];
    return o ? { ...t, ...o } : t;
  });
  const done = tasks.filter((t) => t.done).length;
  const pendingTaskIds = new Set(scoped.filter((i) => i.kind === OUTBOX_KIND.task).map((i) => (i.payload as TaskPayload).taskId));
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  /* ── Fotos ── */
  const queuedPhotos = scoped
    .filter((i) => i.kind === OUTBOX_KIND.photo)
    .map((i) => ({ id: i.id, ...(i.payload as PhotoPayload) }));
  const photoTaskIds = new Set(
    [...data.photos.map((p) => p.taskId), ...queuedPhotos.map((p) => p.taskId)].filter((x): x is string => Boolean(x)),
  );
  const [photoKind, setPhotoKind] = useState<PhotoKind>(() =>
    data.photos.some((p) => p.kind === "antes") ? "depois" : "antes",
  );
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureFor = useRef<{ kind: PhotoKind; taskId: string | null }>({ kind: "antes", taskId: null });

  /* ── Ações / folhas ── */
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [burst, setBurst] = useState<{ key: number; rect: DOMRect | null } | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!closed) void warmPosition();
  }, [closed]);

  // Itens desta OM recusados ao serem reenviados em segundo plano: desfaz o otimista
  useEffect(
    () =>
      onOutboxEvent((e) => {
        if (e.item.scope !== data.id || e.type !== "failed") return;
        if (e.item.kind === OUTBOX_KIND.status) setOptimisticStatus(null);
        if (e.item.kind === OUTBOX_KIND.task) {
          const id = (e.item.payload as TaskPayload).taskId;
          setOverrides((o) => {
            const c = { ...o };
            delete c[id];
            return c;
          });
        }
      }),
    [data.id],
  );

  function showPending(ids: string[], message?: string) {
    setHighlight(new Set(ids));
    if (message) toast.error(message);
    haptic([30, 40, 30]);
    setTimeout(() => {
      const el = document.getElementById(`task-${ids[0]}`);
      el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      el?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    }, 320);
  }

  async function changeStatus(to: WorkOrderStatus, note?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    haptic(12);
    setOptimisticStatus(to);
    const pos = await getPosition();
    const payload: StatusPayload = {
      workOrderId: data.id,
      to: to as StatusPayload["to"],
      note: note ?? null,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
    };
    const r = await submit<TechState>(OUTBOX_KIND.status, payload, { scope: data.id });
    setBusy(false);
    if (r.queued) {
      toast("Sem conexão: guardado no aparelho", { description: "O novo status será enviado quando a internet voltar." });
      return true;
    }
    if (r.ok === false) {
      setOptimisticStatus(null);
      toast.error(r.error ?? "Não foi possível mudar o status.");
      return false;
    }
    if (r.message) toast.success(r.message);
    return true;
  }

  function saveTask(task: ExecTask, patch: TaskPatch) {
    const next: TaskPayload = {
      taskId: task.id,
      workOrderId: data.id,
      done: patch.done ?? task.done,
      measurementValue: patch.measurementValue !== undefined ? patch.measurementValue : task.measurementValue,
      notes: patch.notes !== undefined ? patch.notes : task.notes,
    };
    setOverrides((o) => ({ ...o, [task.id]: { done: next.done, measurementValue: next.measurementValue, notes: next.notes } }));
    if (highlight.has(task.id) && next.done && (!task.measurementUnit || next.measurementValue)) {
      setHighlight((h) => {
        const c = new Set(h);
        c.delete(task.id);
        return c;
      });
    }
    if (patch.done !== undefined && patch.done !== task.done) haptic(patch.done ? 10 : 6);
    void submit<TechState>(OUTBOX_KIND.task, next, { key: taskKey(task.id), scope: data.id }).then((r) => {
      if (!r.queued && r.ok === false) {
        toast.error(r.error ?? "Não foi possível salvar o item.");
        setOverrides((o) => {
          const c = { ...o };
          delete c[task.id];
          return c;
        });
      }
    });
  }

  function capture(kind: PhotoKind, taskId: string | null = null) {
    captureFor.current = { kind, taskId };
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "") {
      toast.error("Escolha uma foto (imagem).");
      return;
    }
    setProcessing(true);
    try {
      const { dataUrl } = await compressImage(file);
      const { kind, taskId } = captureFor.current;
      const r = await submit<PhotoState>(OUTBOX_KIND.photo, { workOrderId: data.id, kind, taskId, dataUrl } satisfies PhotoPayload, {
        scope: data.id,
      });
      if (r.queued) toast("Foto guardada no aparelho", { description: "Ela será enviada quando a internet voltar." });
      else if (r.ok === false) toast.error(r.error ?? "Não foi possível enviar a foto.");
      else {
        haptic(10);
        toast.success("Foto enviada");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível processar a foto.");
    } finally {
      setProcessing(false);
    }
  }

  async function conclude(form: ConclusionForm): Promise<ConcludeOutcome> {
    if (!isOnline()) {
      return { error: "Sem conexão. Para concluir é preciso internet; o rascunho e a assinatura ficam salvos neste aparelho." };
    }
    await flushOutbox();
    const left = getOutboxItems().filter((i) => i.scope === data.id).length;
    if (left) {
      return { error: `Ainda há ${plural(left, "alteração", "alterações")} desta OM para enviar. Aguarde o sinal melhorar e toque em Concluir de novo.` };
    }
    const pending = tasks.filter((t) => !t.done || (t.measurementUnit && !t.measurementValue?.trim()));
    if (pending.length) {
      setConcludeOpen(false);
      const missingOnly = pending.every((t) => t.done);
      showPending(
        pending.map((t) => t.id),
        missingOnly
          ? `Registre a medição de: ${pending.map((t) => t.title).join(", ")}.`
          : `Faltam ${plural(pending.length, "item", "itens")} do checklist.`,
      );
      return;
    }
    const pos = await getPosition();
    let r: CompleteState;
    try {
      r = await completeAction({ workOrderId: data.id, ...form, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
    } catch {
      return { error: "A conexão caiu durante o envio. Confira a internet e toque em Concluir OM de novo." };
    }
    if (!r.ok) {
      if (r.pendingTaskIds?.length) {
        setConcludeOpen(false);
        showPending(r.pendingTaskIds, r.error);
        return;
      }
      return { error: r.error ?? "Não foi possível concluir a OM.", fieldErrors: r.fieldErrors };
    }
    clearDraft(data.id);
    setConcludeOpen(false);
    setOptimisticStatus("concluida");
    setBurst({ key: Date.now(), rect: primaryRef.current?.getBoundingClientRect() ?? null });
    setSuccess({ commission: r.commission ?? null, commissionPending: r.commissionStatus === "pendente", nextId: r.nextId ?? null });
    haptic([16, 60, 30]);
  }

  const primary = primaryFor(status, data.atSite, data.nextId);
  function onPrimary() {
    if (!primary || busy) return;
    if (primary.kind === "conclude") {
      haptic(8);
      setConcludeOpen(true);
    } else if (primary.kind === "status") void changeStatus(primary.to);
  }

  const lockedReason =
    status === "em_deslocamento"
      ? "Ao chegar, toque em “Cheguei, iniciar atendimento” para liberar o checklist."
      : closed
        ? null
        : "Inicie o atendimento para liberar o checklist.";
  const locked = !WORKING.has(status) || closed;
  const when = data.scheduledDate
    ? `${data.scheduledDate === data.today ? "Hoje" : data.scheduledDate < data.today ? `Atrasada, era ${formatDayMonth(data.scheduledDate)}` : formatDate(data.scheduledDate)}${
        data.scheduledTime ? `, ${formatTime(data.scheduledTime)}${data.endTime ? ` até ${data.endTime}` : ""}` : ""
      }`
    : "Sem data marcada";
  const overdue = data.scheduledDate != null && data.scheduledDate < data.today && !closed;

  return (
    <div className="space-y-7">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <Link href="/tecnico" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-steel active:text-frost">
            <ChevronLeft className="size-4" />
            Hoje
          </Link>
          <span className="readout text-sm text-steel">{formatOM(data.number)}</span>
        </div>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-silver-brushed text-[1.65rem] font-semibold leading-tight">{data.customerName}</h1>
            <p className="mt-1.5 text-[0.95rem] leading-snug text-frost/85">{data.title}</p>
          </div>
          <ProgressRing done={done} total={tasks.length} size={64} stroke={5} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={status}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.2 }}
            >
              <WorkOrderStatusBadge status={status} />
            </motion.span>
          </AnimatePresence>
          {queuedStatus && (
            <ToneBadge tone="brass">
              <CloudUpload className="-ml-0.5 size-3" />
              Aguardando envio
            </ToneBadge>
          )}
          {overdue && <ToneBadge tone="red">Atrasada</ToneBadge>}
          <WorkOrderTypeBadge type={data.type} />
          {(data.priority === "alta" || data.priority === "urgente") && <PriorityBadge value={data.priority} />}
        </div>
        <p className={overdue ? "text-sm font-medium text-gauge-red" : "text-sm text-steel"}>{when}</p>
      </header>

      <div className="space-y-3">{children}</div>

      <Section
        id="checklist"
        title="Checklist"
        aside={tasks.length > 0 && <span className="readout pb-0.5 text-sm text-steel">{`${done} de ${tasks.length}`}</span>}
      >
        <Checklist
          tasks={tasks}
          locked={locked}
          lockedReason={lockedReason}
          pendingTaskIds={pendingTaskIds}
          highlight={highlight}
          photoTaskIds={photoTaskIds}
          onSave={saveTask}
          onPhoto={(taskId) => capture("depois", taskId)}
        />
      </Section>

      <Section
        id="fotos"
        title="Fotos"
        aside={
          data.photos.length + queuedPhotos.length > 0 && (
            <span className="readout pb-0.5 text-sm text-steel">{data.photos.length + queuedPhotos.length}</span>
          )
        }
      >
        <Photos
          photos={data.photos}
          queued={queuedPhotos}
          closed={closed}
          online={outbox.online}
          processing={processing}
          kind={photoKind}
          onKindChange={setPhotoKind}
          onCapture={() => capture(photoKind)}
          taskTitles={new Map(data.tasks.map((t) => [t.id, t.title]))}
        />
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      </Section>

      <Section id="materiais" title="Materiais">
        <Materials
          workOrderId={data.id}
          materials={data.materials}
          catalog={data.catalog}
          locationName={data.locationName}
          closed={closed}
          online={outbox.online}
        />
      </Section>

      {data.status === "concluida" && (
        <Section id="conclusao" title="Conclusão">
          <div className="panel space-y-4 p-4">
            {data.finishedAt && <p className="text-sm text-steel">Concluída em {formatDateTime(data.finishedAt)}</p>}
            {data.solution && (
              <div>
                <p className="text-xs text-steel">O que foi feito</p>
                <p className="mt-0.5 whitespace-pre-line text-[0.95rem] leading-relaxed text-silver">{data.solution}</p>
              </div>
            )}
            {data.diagnosis && (
              <div>
                <p className="text-xs text-steel">{data.type === "corretiva" ? "Defeito encontrado" : "Diagnóstico"}</p>
                <p className="mt-0.5 whitespace-pre-line text-[0.95rem] leading-relaxed text-silver">{data.diagnosis}</p>
              </div>
            )}
            {data.technicianNotes && (
              <div>
                <p className="text-xs text-steel">Observações para o escritório</p>
                <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-silver">{data.technicianNotes}</p>
              </div>
            )}
            {data.signatureUrl && (
              <figure>
                <div className="rounded-xl bg-[#f4f8fc] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.signatureUrl} alt={`Assinatura de ${data.signedByName ?? "cliente"}`} className="mx-auto h-28 w-auto object-contain" />
                </div>
                <figcaption className="mt-1.5 text-xs text-steel">Assinado por {data.signedByName ?? "cliente"}</figcaption>
              </figure>
            )}
            {data.commission && data.commission.amount > 0 && (
              <p className="flex items-baseline justify-between border-t border-rime pt-3 text-sm text-steel">
                Sua comissão nesta OM
                <span className="readout text-base font-semibold text-mint">
                  {data.commission.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </p>
            )}
          </div>
        </Section>
      )}

      <ActionBar
        status={status}
        primary={primary}
        busy={busy}
        progressHint={primary?.kind === "conclude" && tasks.length && done < tasks.length ? `${done}/${tasks.length}` : null}
        primaryRef={primaryRef}
        onPrimary={onPrimary}
        onPause={() => void changeStatus("pausada")}
        onMore={() => setMoreOpen(true)}
        showMore={!closed}
        reportHref={reportHref}
        success={success}
        onCloseSuccess={() => setSuccess(null)}
      />

      {burst && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40"
          style={
            burst.rect
              ? { left: burst.rect.left, top: burst.rect.top, width: burst.rect.width, height: burst.rect.height }
              : { left: "50%", bottom: 40, width: 1, height: 1 }
          }
        >
          <FrostBurst burstKey={burst.key} size={280} />
        </div>
      )}

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} status={status} atSite={data.atSite} busy={busy} onStatus={changeStatus} />
      <ConclusionSheet
        open={concludeOpen}
        onOpenChange={setConcludeOpen}
        workOrderId={data.id}
        type={data.type}
        isPlanVisit={data.isPlanVisit}
        online={outbox.online}
        initial={{ solution: data.solution, diagnosis: data.diagnosis, technicianNotes: data.technicianNotes }}
        onConclude={conclude}
      />
    </div>
  );
}
