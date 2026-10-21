import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ToneBadge } from "@/components/system/tone-badge";
import { formatBRL } from "@/lib/format";
import { productCategory } from "@/lib/labels";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { setLocationActive } from "./actions";
import { LocationDialog } from "./_components/location-dialog";
import { StockActions } from "./_components/movement-dialogs";
import { ParamSelect } from "./_components/param-controls";
import { SectionTabs } from "./_components/section-tabs";
import { StockGauge } from "./_components/stock-gauge";
import {
  getFilterCounts,
  getMovementData,
  getStockReadouts,
  listLocationsSummary,
  listProducts,
  listTechnicianOptions,
  type StockFilter,
} from "./_lib/queries";
import { categoryOptions, formatQty } from "./_lib/stock-format";

export const metadata: Metadata = { title: "Estoque" };

export default async function EstoquePage({ searchParams }: PageProps<"/admin/estoque">) {
  const sp = await searchParams;
  const view = param(sp, "aba") === "locais" ? "locais" : "produtos";
  const [readouts, movementData, locations] = await Promise.all([
    getStockReadouts(),
    getMovementData(),
    listLocationsSummary(),
  ]);
  const activeLocations = locations.filter((l) => l.active).length;

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Produtos, saldos do almoxarifado e dos veículos, e movimentações. Quando o saldo cai abaixo do mínimo, o sistema abre a solicitação de compra."
        actions={
          <>
            <StockActions data={movementData} />
            <Button asChild>
              <Link href="/admin/estoque/novo">
                <Plus />
                Novo produto
              </Link>
            </Button>
          </>
        }
      />

      <ReadoutBand
        className="mb-8"
        items={[
          { label: "Itens cadastrados", value: readouts.active, hint: "produtos ativos" },
          {
            label: "Abaixo do mínimo",
            value: readouts.below,
            tone: readouts.empty > 0 ? "red" : readouts.below > 0 ? "brass" : "mint",
            hint: readouts.empty > 0 ? `${readouts.empty} sem saldo nenhum` : readouts.below > 0 ? "ver itens" : "tudo em dia",
            href: "/admin/estoque?filtro=abaixo",
          },
          { label: "Valor em estoque", value: readouts.value, format: "brl", hint: "saldo × custo" },
          {
            label: "Solicitações abertas",
            value: readouts.openRequests,
            tone: readouts.openRequests > 0 ? "brass" : undefined,
            hint: "aguardando pedido",
            href: "/admin/compras",
          },
        ]}
      />

      <SectionTabs
        layoutId="estoque-section"
        current={view}
        tabs={[
          { value: "produtos", label: "Produtos", href: "/admin/estoque", count: readouts.active },
          { value: "locais", label: "Locais", href: "/admin/estoque?aba=locais", count: activeLocations },
        ]}
      />

      {view === "produtos" ? (
        <ProductsSection sp={sp} locations={locations} />
      ) : (
        <LocationsSection locations={locations} />
      )}
    </>
  );
}

async function ProductsSection({
  sp,
  locations,
}: {
  sp: Awaited<PageProps<"/admin/estoque">["searchParams"]>;
  locations: Awaited<ReturnType<typeof listLocationsSummary>>;
}) {
  const rawFilter = param(sp, "filtro");
  const filter: StockFilter = rawFilter === "abaixo" || rawFilter === "inativos" ? rawFilter : "todos";
  const q = param(sp, "q");
  const category = param(sp, "categoria");
  const locationId = param(sp, "local");
  const location = locations.find((l) => l.id === locationId);
  const page = pageFrom(sp);
  const [{ rows, total }, counts] = await Promise.all([
    listProducts({ q, filter, category, locationId: location?.id, page }),
    getFilterCounts(),
  ]);
  const filtered = Boolean(q || category || location || filter !== "todos");

  return (
    <Panel flush>
      <div className="flex flex-col gap-3 border-b border-rime p-4 xl:flex-row xl:items-center">
        <SearchInput placeholder="Buscar por nome, SKU ou código de barras" className="xl:w-80" />
        <FilterTabs
          param="filtro"
          options={[
            { value: "", label: "Todos", count: counts.all },
            { value: "abaixo", label: "Abaixo do mínimo", count: counts.below },
            { value: "inativos", label: "Inativos", count: counts.inactive },
          ]}
        />
        <div className="flex flex-col gap-3 sm:flex-row xl:ml-auto">
          <ParamSelect param="categoria" label="Categoria" placeholder="Todas as categorias" options={categoryOptions} />
          <ParamSelect
            param="local"
            label="Local"
            placeholder="Todos os locais"
            options={locations.filter((l) => l.active || l.id === locationId).map((l) => ({ value: l.id, label: l.name }))}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Nenhum produto encontrado"
            description={
              location
                ? `${location.name} não tem saldo de produtos com esses filtros.`
                : "Tente outra busca ou limpe os filtros."
            }
            action={
              <Button variant="outline" asChild>
                <Link href="/admin/estoque">Limpar filtros</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Nenhum produto cadastrado"
            description="Cadastre gases, peças e consumíveis para controlar saldos e gerar compras automáticas."
            action={
              <Button asChild>
                <Link href="/admin/estoque/novo">
                  <Plus />
                  Cadastrar produto
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          {/* Celular: linhas empilhadas */}
          <ul className="divide-y divide-rime md:hidden">
            {rows.map((p) => {
              const below = p.minStock > 0 && p.total < p.minStock;
              return (
                <li key={p.id}>
                  <Link href={`/admin/estoque/${p.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-ice/5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-silver">{p.name}</p>
                      <p className="mt-0.5 truncate text-xs text-steel">{p.sku ?? productCategory[p.category] ?? p.category}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-sm tabular-nums", below ? "text-gauge-red" : "text-silver")}>
                        {formatQty(location ? (p.locationQty ?? 0) : p.total, p.unit)}
                      </p>
                      <div className="mt-1 flex items-center justify-end gap-2 text-xs text-steel">
                        <StockGauge total={p.total} minStock={p.minStock} />
                        {p.minStock > 0 && <span className="tabular-nums">mín. {formatQty(p.minStock, p.unit)}</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop: tabela */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Produto</TableHead>
                  <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                  {location && <TableHead className="text-right">Em {location.name}</TableHead>}
                  <TableHead className="text-right">Saldo total</TableHead>
                  <TableHead className="text-right">Mín. / reposição</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Venda</TableHead>
                  <TableHead className="hidden pr-5 xl:table-cell">Fornecedor preferido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const below = p.minStock > 0 && p.total < p.minStock;
                  return (
                    <TableRow key={p.id} className="relative">
                      <TableCell className="max-w-80 pl-5">
                        <Link
                          href={`/admin/estoque/${p.id}`}
                          className="block truncate font-medium text-silver after:absolute after:inset-0 hover:text-frost"
                        >
                          {p.name}
                        </Link>
                        <span className="text-xs text-steel">{p.sku ?? "Sem SKU"}</span>
                      </TableCell>
                      <TableCell className="hidden text-steel lg:table-cell">{productCategory[p.category] ?? p.category}</TableCell>
                      {location && (
                        <TableCell className="text-right tabular-nums text-silver">{formatQty(p.locationQty ?? 0, p.unit)}</TableCell>
                      )}
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-2.5">
                          <StockGauge total={p.total} minStock={p.minStock} />
                          <span className={cn("tabular-nums", below ? "font-medium text-gauge-red" : "text-silver")}>
                            {formatQty(p.total, p.unit)}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-steel">
                        {p.minStock > 0 ? (
                          <>
                            {formatQty(p.minStock, p.unit)}
                            <span className="text-steel/60"> / {formatQty(p.reorderQty, p.unit)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-silver">{formatBRL(p.costPrice)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums text-steel lg:table-cell">
                        {p.salePrice > 0 ? formatBRL(p.salePrice) : "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-48 truncate pr-5 text-steel xl:table-cell">{p.supplierName ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} />
        </>
      )}
    </Panel>
  );
}

async function LocationsSection({ locations }: { locations: Awaited<ReturnType<typeof listLocationsSummary>> }) {
  const technicians = await listTechnicianOptions();
  return (
    <Panel
      flush
      title="Locais de estoque"
      description="O almoxarifado recebe as compras; cada veículo leva o kit do técnico e as baixas das OMs dele."
      actions={<LocationDialog technicians={technicians} />}
    >
      {locations.length === 0 ? (
        <EmptyState
          title="Nenhum local cadastrado"
          description="Crie o almoxarifado central e um local para o veículo de cada técnico."
          action={<LocationDialog technicians={technicians} />}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Local</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="hidden sm:table-cell">Técnico</TableHead>
              <TableHead className="text-right">Itens com saldo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="hidden sm:table-cell">Situação</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((l) => (
              <TableRow key={l.id} className={cn(!l.active && "opacity-60")}>
                <TableCell className="pl-5">
                  <Link href={`/admin/estoque?local=${l.id}`} className="font-medium text-silver hover:text-frost">
                    {l.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <ToneBadge tone={l.type === "almoxarifado" ? "ice" : "violet"}>
                    {l.type === "almoxarifado" ? "Almoxarifado" : "Veículo"}
                  </ToneBadge>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {l.technicianId ? (
                    <Link href={`/admin/tecnicos/${l.technicianId}`} className="text-steel hover:text-frost">
                      {l.technicianName}
                    </Link>
                  ) : (
                    <span className="text-steel/60">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-silver">{l.items}</TableCell>
                <TableCell className="text-right tabular-nums text-silver">{formatBRL(l.value)}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <ToneBadge tone={l.active ? "mint" : "steel"}>{l.active ? "Ativo" : "Inativo"}</ToneBadge>
                </TableCell>
                <TableCell className="pr-5">
                  <div className="flex items-center justify-end gap-1">
                    <LocationDialog
                      technicians={technicians}
                      location={{ id: l.id, name: l.name, type: l.type, technicianId: l.technicianId }}
                    />
                    <ConfirmAction
                      action={setLocationActive.bind(null, l.id, !l.active)}
                      title={l.active ? `Desativar ${l.name}?` : `Reativar ${l.name}?`}
                      description={
                        l.active
                          ? "O local some das listas de movimentação. Só é possível desativar um local sem saldo."
                          : "O local volta a aparecer nas entradas, transferências e ajustes."
                      }
                      confirmLabel={l.active ? "Desativar local" : "Reativar local"}
                      destructive={l.active}
                      variant="ghost"
                    >
                      {l.active ? "Desativar" : "Reativar"}
                    </ConfirmAction>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
