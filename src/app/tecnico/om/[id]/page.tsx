import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AirVent, ChevronRight, History, KeyRound, MapPin, MessageSquareText, Navigation, Phone } from "lucide-react";
import { toneOnTint } from "@/components/system/tone-badge";
import { requireTechnician } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { addressLine, formatBTU, formatDate, formatEquipmentCode, formatOM, mapsLink, onlyDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { endTime } from "../../_lib/board";
import { customerName, isAtSite, nextWorkOrderId, workOrderForTechnician } from "../../_lib/queries";
import { Execution } from "./_components/execution";
import type { ExecutionData } from "./_lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/tecnico/om/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: UUID.test(id) ? "Execução da OM" : "OM" };
}

export default async function TechWorkOrderPage({ params }: PageProps<"/tecnico/om/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { technician } = await requireTechnician();
  const data = await workOrderForTechnician(id, technician.id);
  if (!data) notFound();
  const { wo, previous, location, catalog, levels, commission } = data;
  const today = todayISO();
  const [atSite, nextId] = await Promise.all([
    isAtSite(technician.id, wo.siteId, wo.id),
    wo.status === "concluida" ? nextWorkOrderId(technician.id, today, wo.id) : Promise.resolve(null),
  ]);

  const available = new Map(levels.map((l) => [l.productId, l.quantity]));
  const exec: ExecutionData = {
    id: wo.id,
    number: wo.number,
    title: wo.title,
    status: wo.status,
    type: wo.type,
    priority: wo.priority,
    customerName: customerName(wo.customer),
    customerPhone: wo.customer.whatsapp || wo.customer.phone || null,
    scheduledDate: wo.scheduledDate,
    scheduledTime: wo.scheduledTime,
    endTime: endTime(wo.scheduledTime, wo.plan?.estimatedMinutes ?? 60),
    today,
    tasks: wo.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      instructions: t.instructions,
      measurementUnit: t.measurementUnit,
      measurementValue: t.measurementValue,
      requiresPhoto: t.requiresPhoto,
      done: t.done,
      notes: t.notes,
    })),
    photos: wo.photos.map((p) => ({ id: p.id, url: p.url, kind: p.kind, taskId: p.taskId })),
    materials: wo.materials.map((m) => ({
      id: m.id,
      productId: m.productId,
      name: m.product.name,
      unit: m.product.unit,
      quantity: m.quantity,
      chargeCustomer: m.chargeCustomer,
      unitPrice: m.unitPrice,
    })),
    catalog: catalog.map((p) => ({ ...p, available: available.has(p.id) ? available.get(p.id)! : null })),
    locationName: location.name,
    solution: wo.solution,
    diagnosis: wo.diagnosis,
    technicianNotes: wo.technicianNotes,
    signatureUrl: wo.signatureUrl,
    signedByName: wo.signedByName,
    finishedAt: wo.finishedAt?.toISOString() ?? null,
    commission: commission ? { amount: commission.amount, status: commission.status } : null,
    nextId,
    atSite,
    isPlanVisit: Boolean(wo.maintenancePlanId),
  };

  const site = wo.site;
  const address = addressLine(site);
  const map = site ? mapsLink(site) : null;
  const phone = onlyDigits(exec.customerPhone);
  const e = wo.equipment;
  const specs = e
    ? [
        { label: "Capacidade", value: e.capacityBtu ? formatBTU(e.capacityBtu) : null },
        { label: "Gás", value: e.refrigerant },
        { label: "Ambiente", value: e.location },
        { label: "Tensão", value: e.voltage },
      ].filter((s) => s.value)
    : [];

  return (
    <Execution data={exec}>
      {/* Local */}
      <section aria-label="Local do atendimento" className="panel overflow-hidden">
        <div className="flex gap-3 p-4">
          <MapPin className="mt-0.5 size-5 shrink-0 text-ice" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.95rem] font-medium text-silver">{site?.name ?? "Local não informado"}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-steel">{address || "Endereço não cadastrado. Confirme com o escritório."}</p>
          </div>
        </div>
        {site?.accessNotes && (
          <div className="mx-4 mb-4 flex gap-2.5 rounded-xl bg-brass/10 px-3.5 py-3 ring-1 ring-brass/25">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-brass" />
            <p className="text-sm leading-relaxed text-silver">
              <span className={cn("font-semibold", toneOnTint.brass)}>Acesso: </span>
              {site.accessNotes}
            </p>
          </div>
        )}
        {(map || phone) && (
          <div className="grid grid-flow-col auto-cols-fr border-t border-rime">
            {map && (
              <a
                href={map}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 text-sm font-medium text-ice active:bg-ice/10"
              >
                <Navigation className="size-4" />
                Abrir no mapa
              </a>
            )}
            {phone && (
              <a
                href={`tel:+55${phone.replace(/^55/, "")}`}
                className="flex h-12 items-center justify-center gap-2 border-l border-rime text-sm font-medium text-ice first:border-l-0 active:bg-ice/10"
              >
                <Phone className="size-4" />
                Ligar para o cliente
              </a>
            )}
          </div>
        )}
      </section>

      {/* Equipamento */}
      {e ? (
        <Link href={`/tecnico/equipamento/${e.id}`} className="panel block overflow-hidden active:bg-ice/5" aria-label="Abrir ficha do equipamento">
          <div className="flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ice/10 text-ice ring-1 ring-ice/25">
              <AirVent className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem] font-semibold text-silver">{e.type?.name ?? "Equipamento"}</p>
              <p className="truncate text-sm text-steel">
                {[e.brand, e.model].filter(Boolean).join(" ") || "Marca e modelo não informados"}
              </p>
            </div>
            <span className="readout shrink-0 text-xs text-steel">{formatEquipmentCode(e.code)}</span>
            <ChevronRight className="size-4 shrink-0 text-steel" />
          </div>
          {specs.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rime px-4 py-3.5">
              {specs.map((s) => (
                <div key={s.label} className="min-w-0">
                  <dt className="text-xs text-steel">{s.label}</dt>
                  <dd className="truncate text-[0.95rem] font-medium text-silver">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Link>
      ) : null}

      {/* Do escritório */}
      {wo.description && (
        <section className="panel flex gap-3 p-4" aria-label="Orientação do escritório">
          <MessageSquareText className="mt-0.5 size-5 shrink-0 text-frost" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-silver">Do escritório</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-steel">{wo.description}</p>
          </div>
        </section>
      )}

      {/* Última visita */}
      {previous && (
        <section className="panel flex gap-3 p-4" aria-label="Última visita neste equipamento">
          <History className="mt-0.5 size-5 shrink-0 text-violet" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-silver">
              Última visita em {formatDate(previous.finishedAt ?? previous.scheduledDate)}
              {previous.technician?.name ? <span className="font-normal text-steel">, por {previous.technician.name.split(" ")[0]}</span> : null}
            </p>
            <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-steel">
              {previous.solution || `Sem descrição registrada (${formatOM(previous.number)}).`}
            </p>
          </div>
        </section>
      )}
    </Execution>
  );
}
