import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomInt } from "node:crypto";
import {
  AirVent,
  CalendarClock,
  ClipboardList,
  FileSignature,
  History,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Plus,
  Printer,
  Star,
  Trash2,
  Wallet,
} from "lucide-react";
import { ConfirmAction } from "@/components/system/confirm-action";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "@/components/system/page-header";
import { DetailList, Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import {
  ContractStatusBadge,
  EquipmentStatusBadge,
  ReceivableStatusBadge,
  WorkOrderStatusBadge,
  WorkOrderTypeBadge,
} from "@/components/system/status";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import {
  addressLine,
  formatBRL,
  formatBTU,
  formatCompetence,
  formatContractCode,
  formatCustomerCode,
  formatDate,
  formatDocument,
  formatEquipmentCode,
  formatOM,
  formatPhone,
  mapsLink,
  whatsappLink,
} from "@/lib/format";
import { toISODate } from "@/lib/dates";
import { labelOf, paymentMethod } from "@/lib/labels";
import { param } from "@/lib/params";
import { cn } from "@/lib/utils";
import { RefrigerantTag } from "../../equipamentos/_components/refrigerant";
import { TypeIcon } from "../../equipamentos/_components/type-icon";
import { deleteSite, setPrimarySite } from "../actions";
import { ClickableRow } from "../_components/clickable-row";
import { PortalAccess } from "../_components/portal-access";
import { SiteDialog } from "../_components/site-dialog";
import { UrlTabs, type TabDef } from "../_components/url-tabs";
import { getCustomerDetail, getCustomerForEdit, type CustomerDetail } from "../_lib/queries";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/admin/clientes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = await getCustomerForEdit(id);
  return { title: c ? c.tradeName || c.name : "Cliente" };
}

const TAB_VALUES = ["geral", "locais", "equipamentos", "contratos", "oms", "financeiro", "portal"] as const;

export default async function ClientePage({ params, searchParams }: PageProps<"/admin/clientes/[id]">) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const d = await getCustomerDetail(id);
  if (!d) notFound();
  const c = d.customer;
  const requested = param(sp, "tab");
  const tab = TAB_VALUES.includes(requested as (typeof TAB_VALUES)[number]) ? requested! : "geral";

  const displayName = c.tradeName || c.name;
  const firstName = c.personType === "pf" ? c.name.split(/\s+/)[0] : displayName;
  const wa = whatsappLink(c.whatsapp ?? c.phone, `Olá, ${firstName}! Aqui é da Imperium Tec Refrigeração.`);
  const activeEquipment = d.equipment.filter((e) => e.status !== "removido");
  const primarySite = d.sites.find((s) => s.isPrimary) ?? d.sites[0] ?? null;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const workOrders = [...d.workOrders].sort(
    (a, b) => woDate(b).localeCompare(woDate(a)) || woTime(b) - woTime(a),
  );

  const tabs: TabDef[] = [
    { value: "geral", label: "Visão geral" },
    { value: "locais", label: "Locais", count: d.sites.length },
    { value: "equipamentos", label: "Equipamentos", count: activeEquipment.length },
    { value: "contratos", label: "Contratos", count: d.contracts.length },
    { value: "oms", label: "OMs", count: d.workOrders.length },
    {
      value: "financeiro",
      label: "Financeiro",
      count: d.totals.overdueCount || undefined,
      alert: d.totals.overdueCount > 0,
    },
    { value: "portal", label: "Acesso ao portal" },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/clientes", label: "Clientes" }}
        title={displayName}
        description={c.tradeName ? c.name : undefined}
        meta={
          <>
            <span className="rounded-md bg-glacier px-2 py-0.5 text-xs font-medium tabular-nums text-frost/90 ring-1 ring-rime">
              {formatCustomerCode(c.code)}
            </span>
            <span className="rounded-md bg-glacier px-2 py-0.5 text-xs font-medium text-frost/90 ring-1 ring-rime">
              {c.personType === "pj" ? "Pessoa jurídica" : "Pessoa física"}
            </span>
            {c.status === "ativo" ? <ToneBadge tone="mint">Ativo</ToneBadge> : <ToneBadge tone="steel">Inativo</ToneBadge>}
            {d.activeContracts.length > 0 && <ToneBadge tone="ice">Contrato ativo</ToneBadge>}
            {d.totals.overdueCount > 0 && (
              <ToneBadge tone="red">
                {d.totals.overdueCount === 1 ? "1 conta vencida" : `${d.totals.overdueCount} contas vencidas`}
              </ToneBadge>
            )}
            {c.userId && <ToneBadge tone="violet">Usa o portal</ToneBadge>}
          </>
        }
        actions={
          <>
            {wa && (
              <Button asChild variant="outline" size="lg">
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle className="text-mint" />
                  WhatsApp
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="lg">
              <Link href={`/admin/clientes/${c.id}/editar`}>
                <Pencil />
                Editar
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={`/admin/contratos/novo?customerId=${c.id}`}>
                <FileSignature />
                Novo contrato
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href={`/admin/oms/nova?customerId=${c.id}`}>
                <Plus />
                Nova OM
              </Link>
            </Button>
          </>
        }
      />

      <UrlTabs tabs={tabs} defaultValue={tab}>
        <TabsContent value="geral" className="space-y-6">
          <Overview d={d} primarySite={primarySite} activeEquipment={activeEquipment.length} />
        </TabsContent>

        <TabsContent value="locais">
          <Panel
            flush
            title="Locais de atendimento"
            description="Endereços onde ficam os equipamentos deste cliente."
            actions={<SiteDialog customerId={c.id} isOnlySite={d.sites.length === 0} />}
          >
            {d.sites.length === 0 ? (
              <EmptyState
                icon={<MapPin className="size-6 text-frost" />}
                title="Nenhum local cadastrado"
                description="Adicione o endereço de atendimento para vincular equipamentos e abrir OMs."
              />
            ) : (
              <ul className="divide-y divide-rime">
                {d.sites.map((s) => {
                  const maps = mapsLink(s);
                  const eqCount = d.equipment.filter((e) => e.siteId === s.id && e.status !== "removido").length;
                  return (
                    <li key={s.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span
                          className={cn(
                            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ring-1",
                            s.isPrimary ? "bg-ice/12 text-ice ring-ice/30" : "bg-glacier text-steel ring-rime",
                          )}
                        >
                          <MapPin className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-medium text-silver">
                            {s.name}
                            {s.isPrimary && <ToneBadge tone="ice">Principal</ToneBadge>}
                          </p>
                          <p className="mt-0.5 text-sm text-silver/85">{addressLine(s) || "Endereço não informado"}</p>
                          <p className="mt-0.5 text-xs text-steel">
                            {[
                              s.zip && `CEP ${s.zip}`,
                              `${eqCount} ${eqCount === 1 ? "equipamento" : "equipamentos"}`,
                              s.areaM2 != null && `${s.areaM2.toLocaleString("pt-BR")} m² climatizados`,
                              s.occupants != null && `${s.occupants} ocupantes`,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                          {s.accessNotes && (
                            <p className="mt-2 max-w-2xl rounded-lg bg-night/60 px-3 py-2 text-sm text-steel ring-1 ring-rime">
                              {s.accessNotes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1 pl-12 lg:pl-0">
                        {maps && (
                          <Button asChild variant="ghost" size="sm">
                            <a href={maps} target="_blank" rel="noreferrer">
                              <Navigation />
                              Abrir no Maps
                            </a>
                          </Button>
                        )}
                        <SiteDialog customerId={c.id} site={s} />
                        {!s.isPrimary && (
                          <ConfirmAction
                            action={setPrimarySite.bind(null, c.id, s.id)}
                            title={`Tornar “${s.name}” o local principal?`}
                            description="O local principal aparece na lista de clientes e é sugerido nas novas OMs."
                            confirmLabel="Tornar principal"
                            success="Local principal definido"
                            variant="ghost"
                          >
                            <Star />
                            Tornar principal
                          </ConfirmAction>
                        )}
                        <ConfirmAction
                          action={deleteSite.bind(null, c.id, s.id)}
                          title={`Excluir o local “${s.name}”?`}
                          description={
                            eqCount > 0
                              ? `Este local tem ${eqCount} equipamento(s). Mova-os para outro local antes de excluir.`
                              : "O endereço será apagado. Esta ação não pode ser desfeita."
                          }
                          confirmLabel="Excluir local"
                          success="Local excluído"
                          destructive
                          variant="ghost"
                          className="text-steel hover:text-gauge-red"
                        >
                          <Trash2 />
                          <span className="sr-only">Excluir local</span>
                        </ConfirmAction>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="equipamentos">
          <Panel
            flush
            title="Equipamentos"
            description={
              d.equipment.length > activeEquipment.length
                ? `${activeEquipment.length} em uso e ${d.equipment.length - activeEquipment.length} removido(s).`
                : "Aparelhos instalados nos locais do cliente."
            }
            actions={
              <>
                {activeEquipment.length > 0 && (
                  <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                    <Link href={`/admin/equipamentos/etiquetas?customerId=${c.id}`}>
                      <Printer />
                      Imprimir etiquetas
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link href={`/admin/equipamentos/novo?customerId=${c.id}`}>
                    <Plus />
                    Adicionar equipamento
                  </Link>
                </Button>
              </>
            }
          >
            {d.equipment.length === 0 ? (
              <EmptyState
                icon={<AirVent className="size-6 text-frost" />}
                title="Nenhum equipamento cadastrado"
                description="Cadastre os aparelhos do cliente para planejar as manutenções e imprimir as etiquetas QR."
                action={
                  <Button asChild>
                    <Link href={`/admin/equipamentos/novo?customerId=${c.id}`}>
                      <Plus />
                      Adicionar equipamento
                    </Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-rime hover:bg-transparent">
                    <TableHead className="pl-5 text-steel">Código</TableHead>
                    <TableHead className="text-steel">Equipamento</TableHead>
                    <TableHead className="text-right text-steel">Capacidade</TableHead>
                    <TableHead className="text-steel">Fluido</TableHead>
                    <TableHead className="text-steel">Local</TableHead>
                    <TableHead className="text-steel">Cobertura</TableHead>
                    <TableHead className="pr-5 text-steel">Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.equipment.map((e) => {
                    const link = e.contractLinks[0];
                    return (
                      <ClickableRow
                        key={e.id}
                        href={`/admin/equipamentos/${e.id}`}
                        className={cn(e.status === "removido" && "opacity-55")}
                      >
                        <TableCell className="pl-5 text-xs tabular-nums text-steel">{formatEquipmentCode(e.code)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <TypeIcon icon={e.type?.icon} size="sm" />
                            <div className="min-w-0">
                              <Link href={`/admin/equipamentos/${e.id}`} className="block font-medium text-silver hover:text-frost">
                                {e.type?.name ?? "Equipamento"}
                              </Link>
                              <span className="block text-xs text-steel">
                                {[e.brand, e.model].filter(Boolean).join(" ") || "Marca não informada"}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-silver/90">{formatBTU(e.capacityBtu)}</TableCell>
                        <TableCell>
                          <RefrigerantTag value={e.refrigerant} />
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="block text-silver/90">{e.location ?? "—"}</span>
                          {e.site && <span className="block text-xs text-steel">{e.site.name}</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {link ? (
                            <>
                              <span className="block text-silver/90">{link.plan.name}</span>
                              <span className="block text-xs text-steel">{formatContractCode(link.contract.code)}</span>
                            </>
                          ) : (
                            <span className="text-steel">Avulso</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-5">
                          <EquipmentStatusBadge status={e.status} />
                        </TableCell>
                      </ClickableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="contratos">
          <Panel
            flush
            title="Contratos"
            description="Planos comerciais que geram as mensalidades e as visitas preventivas."
            actions={
              <Button asChild size="sm">
                <Link href={`/admin/contratos/novo?customerId=${c.id}`}>
                  <Plus />
                  Novo contrato
                </Link>
              </Button>
            }
          >
            {d.contracts.length === 0 ? (
              <EmptyState
                icon={<FileSignature className="size-6 text-frost" />}
                title="Sem contrato"
                description="Com um contrato, as visitas preventivas são geradas sozinhas e a mensalidade sai todo mês."
                action={
                  <Button asChild>
                    <Link href={`/admin/contratos/novo?customerId=${c.id}`}>
                      <Plus />
                      Novo contrato
                    </Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-rime hover:bg-transparent">
                    <TableHead className="pl-5 text-steel">Código</TableHead>
                    <TableHead className="text-steel">Plano</TableHead>
                    <TableHead className="text-steel">Situação</TableHead>
                    <TableHead className="text-right text-steel">Mensalidade</TableHead>
                    <TableHead className="text-right text-steel">Vencimento</TableHead>
                    <TableHead className="text-steel">Vigência</TableHead>
                    <TableHead className="pr-5 text-right text-steel">Equip.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.contracts.map((ct) => (
                    <ClickableRow key={ct.id} href={`/admin/contratos/${ct.id}`}>
                      <TableCell className="pl-5 text-xs tabular-nums text-steel">{formatContractCode(ct.code)}</TableCell>
                      <TableCell>
                        <Link href={`/admin/contratos/${ct.id}`} className="font-medium text-silver hover:text-frost">
                          {ct.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <ContractStatusBadge status={ct.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-silver">{formatBRL(ct.monthlyAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-steel">dia {ct.billingDay}</TableCell>
                      <TableCell className="text-sm tabular-nums text-silver/90">
                        {formatDate(ct.startDate)}
                        <span className="text-steel"> até </span>
                        {ct.endDate ? formatDate(ct.endDate) : "sem prazo"}
                      </TableCell>
                      <TableCell className="pr-5 text-right tabular-nums text-silver">{ct.items.length}</TableCell>
                    </ClickableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="oms">
          <Panel
            flush
            title="Ordens de manutenção"
            description={d.workOrders.length >= 40 ? "As 40 mais recentes." : "Visitas e atendimentos deste cliente."}
            actions={
              <Button asChild size="sm">
                <Link href={`/admin/oms/nova?customerId=${c.id}`}>
                  <Plus />
                  Nova OM
                </Link>
              </Button>
            }
          >
            {workOrders.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="size-6 text-frost" />}
                title="Nenhuma OM ainda"
                description="Abra uma OM para registrar uma visita, instalação ou chamado corretivo."
                action={
                  <Button asChild>
                    <Link href={`/admin/oms/nova?customerId=${c.id}`}>
                      <Plus />
                      Nova OM
                    </Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-rime hover:bg-transparent">
                    <TableHead className="pl-5 text-steel">OM</TableHead>
                    <TableHead className="text-steel">Serviço</TableHead>
                    <TableHead className="text-steel">Tipo</TableHead>
                    <TableHead className="text-steel">Situação</TableHead>
                    <TableHead className="text-steel">Data</TableHead>
                    <TableHead className="pr-5 text-steel">Técnico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrders.map((w) => (
                    <ClickableRow key={w.id} href={`/admin/oms/${w.id}`}>
                      <TableCell className="pl-5 text-xs tabular-nums text-steel">{formatOM(w.number)}</TableCell>
                      <TableCell className="max-w-[340px]">
                        <Link href={`/admin/oms/${w.id}`} className="block truncate font-medium text-silver hover:text-frost">
                          {w.title}
                        </Link>
                        {w.equipment && (
                          <span className="block truncate text-xs text-steel">
                            {formatEquipmentCode(w.equipment.code)}
                            {w.equipment.location ? `, ${w.equipment.location}` : ""}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <WorkOrderTypeBadge type={w.type} />
                      </TableCell>
                      <TableCell>
                        <WorkOrderStatusBadge status={w.status} />
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-silver/90">{formatDate(woDate(w) || null)}</TableCell>
                      <TableCell className="pr-5 text-sm text-silver/90">
                        {w.technician?.name ?? <span className="text-steel">Sem técnico</span>}
                      </TableCell>
                    </ClickableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-6">
          <ReadoutBand
            items={[
              { label: "Em aberto", value: d.totals.open, format: "brl", hint: "A vencer ou em análise" },
              {
                label: "Vencido",
                value: d.totals.overdue,
                format: "brl",
                tone: d.totals.overdue > 0 ? "red" : undefined,
                hint: d.totals.overdueCount ? `${d.totals.overdueCount} ${d.totals.overdueCount === 1 ? "conta" : "contas"}` : "Nada vencido",
              },
              { label: "Recebido", value: d.totals.paid, format: "brl", tone: "mint", hint: "Total pago no histórico" },
            ]}
          />
          <Panel
            flush
            title="Contas a receber"
            description="Mensalidades e serviços avulsos deste cliente. A baixa é feita em Contas a receber."
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/financeiro/receber">
                  <Wallet />
                  Contas a receber
                </Link>
              </Button>
            }
          >
            {d.finance.length === 0 ? (
              <EmptyState
                icon={<Wallet className="size-6 text-frost" />}
                title="Nenhuma cobrança"
                description="As mensalidades aparecem aqui quando houver contrato ativo; serviços avulsos, ao concluir a OM."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-rime hover:bg-transparent">
                    <TableHead className="pl-5 text-steel">Descrição</TableHead>
                    <TableHead className="text-steel">Competência</TableHead>
                    <TableHead className="text-steel">Vencimento</TableHead>
                    <TableHead className="text-right text-steel">Valor</TableHead>
                    <TableHead className="text-steel">Situação</TableHead>
                    <TableHead className="pr-5 text-steel">Pagamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.finance.map((r) => (
                    <TableRow key={r.id} className="border-rime hover:bg-ice/[0.03]">
                      <TableCell className="max-w-[320px] pl-5">
                        <span className="block truncate text-silver">{r.description}</span>
                        <span className="block text-xs text-steel">
                          {r.kind === "mensalidade" ? "Mensalidade" : r.kind === "servico" ? "Serviço avulso" : "Outro"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-silver/90">
                        {r.competence ? formatCompetence(r.competence) : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-sm tabular-nums",
                          r.effectiveStatus === "vencido" ? "text-gauge-red" : "text-silver/90",
                        )}
                      >
                        {formatDate(r.dueDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-silver">
                        {formatBRL(r.status === "pago" ? (r.paidAmount ?? r.net) : r.net)}
                      </TableCell>
                      <TableCell>
                        <ReceivableStatusBadge status={r.effectiveStatus} />
                      </TableCell>
                      <TableCell className="pr-5 text-sm text-steel">
                        {r.paidAt
                          ? `${formatDate(r.paidAt)}${r.paymentMethod ? `, ${labelOf(paymentMethod, r.paymentMethod).label}` : ""}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="portal">
          <Panel
            title="Acesso ao portal do cliente"
            description="Login próprio do cliente para acompanhar equipamentos, visitas, mensalidades e PMOC."
          >
            <PortalAccess
              customerId={c.id}
              customerName={firstName}
              customerWhatsapp={c.whatsapp ?? c.phone}
              suggestedEmail={c.email}
              appUrl={appUrl}
              initialPassword={tempPassword()}
              access={
                c.user
                  ? {
                      email: c.user.email,
                      createdAt: c.user.createdAt.toISOString(),
                      lastSessionAt: d.lastSessionAt ? d.lastSessionAt.toISOString() : null,
                      banned: Boolean(c.user.banned),
                    }
                  : null
              }
            />
          </Panel>
        </TabsContent>
      </UrlTabs>
    </>
  );
}

type WoDates = { finishedAt: Date | null; scheduledDate: string | null; dueDate: string | null; createdAt: Date };

/** Dia de referência da OM no calendário de São Paulo (toISOString daria o dia em UTC). */
function woDate(w: WoDates) {
  if (w.finishedAt) return toISODate(w.finishedAt);
  return w.scheduledDate ?? w.dueDate ?? toISODate(w.createdAt);
}

/** Desempate no mesmo dia: a mais recente primeiro. */
function woTime(w: WoDates) {
  return (w.finishedAt ?? w.createdAt).getTime();
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function tempPassword(len = 10) {
  return Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

function Overview({
  d,
  primarySite,
  activeEquipment,
}: {
  d: CustomerDetail;
  primarySite: CustomerDetail["sites"][number] | null;
  activeEquipment: number;
}) {
  const c = d.customer;
  const maps = primarySite ? mapsLink(primarySite) : null;
  return (
    <>
      <ReadoutBand
        items={[
          { label: "Equipamentos", value: activeEquipment, hint: `${d.sites.length} ${d.sites.length === 1 ? "local" : "locais"}` },
          {
            label: "Mensalidade",
            value: d.monthlyAmount,
            format: "brl",
            hint: d.activeContracts.length
              ? d.activeContracts.length === 1
                ? d.activeContracts[0].name
                : `${d.activeContracts.length} contratos ativos`
              : "Sem contrato ativo",
          },
          { label: "Em aberto", value: d.totals.open, format: "brl", hint: "A vencer ou em análise" },
          {
            label: "Vencido",
            value: d.totals.overdue,
            format: "brl",
            tone: d.totals.overdue > 0 ? "red" : undefined,
            hint: d.totals.overdueCount ? `${d.totals.overdueCount} ${d.totals.overdueCount === 1 ? "conta" : "contas"}` : "Em dia",
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Cadastro" className="lg:col-span-2">
          <DetailList
            items={[
              { label: c.personType === "pj" ? "Razão social" : "Nome", value: c.name },
              ...(c.personType === "pj" ? [{ label: "Nome fantasia", value: c.tradeName ?? "—" }] : []),
              {
                label: c.personType === "pj" ? "CNPJ" : "CPF",
                value: c.document ? <span className="tabular-nums">{formatDocument(c.document)}</span> : "—",
              },
              {
                label: "E-mail",
                value: c.email ? (
                  <a href={`mailto:${c.email}`} className="hover:text-frost">
                    {c.email}
                  </a>
                ) : (
                  "—"
                ),
              },
              {
                label: "Telefone",
                value: c.phone ? (
                  <a href={`tel:+55${c.phone}`} className="tabular-nums hover:text-frost">
                    {formatPhone(c.phone)}
                  </a>
                ) : (
                  "—"
                ),
              },
              { label: "WhatsApp", value: c.whatsapp ? <span className="tabular-nums">{formatPhone(c.whatsapp)}</span> : "—" },
              { label: "Técnico preferencial", value: c.defaultTechnician?.name ?? "Sem preferência" },
              { label: "Cliente desde", value: formatDate(c.createdAt) },
            ]}
          />
          {c.notes && (
            <div className="mt-5 border-t border-rime pt-4">
              <p className="text-xs text-steel">Observações</p>
              <p className="mt-1 whitespace-pre-line text-sm text-silver/90">{c.notes}</p>
            </div>
          )}
        </Panel>

        <Panel title="Atendimento">
          <div className="space-y-5">
            <VisitLine
              icon={<History className="size-4" />}
              label="Última visita"
              empty="Nenhuma visita concluída"
              date={d.lastVisit?.finishedAt ?? null}
              who={d.lastVisit?.technician ?? null}
              href={d.lastVisit ? `/admin/oms/${d.lastVisit.id}` : null}
              number={d.lastVisit?.number ?? null}
            />
            <VisitLine
              icon={<CalendarClock className="size-4" />}
              label="Próxima visita"
              empty="Nada agendado"
              date={d.nextVisit?.date ?? null}
              who={d.nextVisit?.technician ?? null}
              href={d.nextVisit ? `/admin/oms/${d.nextVisit.id}` : null}
              number={d.nextVisit?.number ?? null}
              overdue={Boolean(d.nextVisit?.date && d.nextVisit.date < d.today)}
            />
            <div className="border-t border-rime pt-4">
              <p className="text-xs text-steel">Local principal</p>
              {primarySite ? (
                <>
                  <p className="mt-0.5 text-sm font-medium text-silver">{primarySite.name}</p>
                  <p className="text-sm text-silver/80">{addressLine(primarySite) || "Endereço não informado"}</p>
                  {maps && (
                    <a
                      href={maps}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm text-ice hover:text-frost"
                    >
                      <Navigation className="size-3.5" />
                      Abrir rota no Google Maps
                    </a>
                  )}
                </>
              ) : (
                <p className="mt-0.5 text-sm text-steel">Nenhum endereço cadastrado.</p>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function VisitLine({
  icon,
  label,
  empty,
  date,
  who,
  href,
  number,
  overdue = false,
}: {
  icon: React.ReactNode;
  label: string;
  empty: string;
  date: Date | string | null;
  who: string | null;
  href: string | null;
  number: number | null;
  overdue?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-glacier text-frost ring-1 ring-rime">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-steel">{label}</p>
        {date ? (
          <>
            <p className={cn("text-[0.95rem] font-medium tabular-nums", overdue ? "text-brass" : "text-silver")}>
              {formatDate(date)}
              {overdue && <span className="ml-2 text-xs font-normal">atrasada</span>}
            </p>
            <p className="text-xs text-steel">
              {who ?? "Sem técnico"}
              {href && number != null && (
                <>
                  {", "}
                  <Link href={href} className="text-ice hover:text-frost">
                    {formatOM(number)}
                  </Link>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-sm text-steel">{empty}</p>
        )}
      </div>
    </div>
  );
}
