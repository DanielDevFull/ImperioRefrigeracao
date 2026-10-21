import type { Metadata } from "next";
import Link from "next/link";
import { AirVent, Plus } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { EquipmentTable } from "./_components/equipment-table";
import { ParamSelect } from "./_components/param-select";
import {
  EQUIPMENT_STATUSES,
  equipmentStatusCounts,
  equipmentTypeOptions,
  isUuid,
  listEquipment,
  type EquipmentStatus,
} from "./_lib/queries";

export const metadata: Metadata = { title: "Equipamentos" };

export default async function EquipamentosPage({ searchParams }: PageProps<"/admin/equipamentos">) {
  const sp = await searchParams;
  const q = param(sp, "q");
  const rawStatus = param(sp, "status");
  const status = EQUIPMENT_STATUSES.includes(rawStatus as EquipmentStatus) ? (rawStatus as EquipmentStatus) : undefined;
  const rawType = param(sp, "tipo");
  const typeId = isUuid(rawType) ? rawType : undefined;
  const page = pageFrom(sp);

  const [{ rows, total }, counts, types] = await Promise.all([
    listEquipment({ q, status, typeId, page }),
    equipmentStatusCounts({ q, typeId }),
    equipmentTypeOptions(),
  ]);
  const filtered = Boolean(q || status || typeId);

  return (
    <>
      <PageHeader
        title="Equipamentos"
        description={
          counts.all
            ? `${counts.ativo + counts.em_manutencao} em operação. Selecione aparelhos na lista para imprimir as etiquetas QR.`
            : "Cadastre os aparelhos dos clientes para planejar as visitas e imprimir as etiquetas QR."
        }
        actions={
          <Button asChild size="lg">
            <Link href="/admin/equipamentos/novo">
              <Plus />
              Novo equipamento
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <FilterTabs
          options={[
            { value: "", label: "Todos", count: counts.all },
            { value: "ativo", label: "Ativos", count: counts.ativo },
            { value: "em_manutencao", label: "Em manutenção", count: counts.em_manutencao },
            { value: "inativo", label: "Inativos", count: counts.inativo },
            { value: "removido", label: "Removidos", count: counts.removido },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <ParamSelect
            param="tipo"
            label="Tipo de equipamento"
            allLabel="Todos os tipos"
            options={types.map((t) => ({ value: t.id, label: t.name }))}
            className="sm:w-52"
          />
          <SearchInput placeholder="Marca, modelo, série, ambiente ou cliente" className="sm:w-80" />
        </div>
      </div>

      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState
            icon={<AirVent className="size-6 text-frost" />}
            title={filtered ? "Nenhum equipamento encontrado" : "Nenhum equipamento ainda"}
            description={
              filtered
                ? "Tente outro termo, outro tipo ou a aba Todos."
                : "Cadastre o primeiro aparelho a partir da ficha do cliente ou aqui mesmo."
            }
            action={
              <Button asChild>
                <Link href="/admin/equipamentos/novo">
                  <Plus />
                  Novo equipamento
                </Link>
              </Button>
            }
          />
        ) : (
          <EquipmentTable
            key={`${q ?? ""}|${status ?? ""}|${typeId ?? ""}`}
            rows={rows.map((r) => ({
              id: r.id,
              code: r.code,
              brand: r.brand,
              model: r.model,
              capacityBtu: r.capacityBtu,
              refrigerant: r.refrigerant,
              location: r.location,
              status: r.status,
              customerId: r.customerId,
              customerLabel: r.customerTradeName || r.customerName,
              typeName: r.typeName,
              typeIcon: r.typeIcon,
              siteName: r.siteName,
              contractId: r.contractId,
              contractCode: r.contractCode,
              planName: r.planName,
              nextVisit: r.nextVisit,
            }))}
          />
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={total} />
      </Panel>
    </>
  );
}
