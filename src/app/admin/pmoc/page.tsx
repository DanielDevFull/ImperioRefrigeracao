import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, ShieldAlert, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ReadoutBand } from "@/components/system/readout-band";
import { ToneBadge } from "@/components/system/tone-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { listPmocDocuments } from "./_lib/list";

export const metadata: Metadata = { title: "PMOC" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function PmocListPage({ searchParams }: PageProps<"/admin/pmoc">) {
  await requireStaff();
  const sp = await searchParams;
  const situacao = param(sp, "situacao") ?? "";
  const q = param(sp, "q");
  const page = pageFrom(sp);
  const { rows, missing } = await listPmocDocuments();

  const current = rows.filter((r) => r.validity.key === "vigente" || r.validity.key === "vencendo");
  const count = (k: string) => rows.filter((r) => r.validity.key === k).length;

  const filtered = rows.filter((r) => {
    if (situacao && r.validity.key !== situacao) return false;
    if (q) {
      const hay = norm(`${r.doc.customer.name} ${r.doc.customer.tradeName ?? ""} ${r.doc.site?.name ?? ""} ${r.doc.artNumber ?? ""}`);
      if (!hay.includes(norm(q))) return false;
    }
    return true;
  });
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const newButton = (
    <Button asChild>
      <Link href="/admin/pmoc/novo">
        <FilePlus2 className="size-4" />
        Novo PMOC
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="PMOC"
        description="Planos de Manutenção, Operação e Controle exigidos pela Lei 13.589/2018 para ambientes climatizados de uso coletivo."
        actions={newButton}
      />

      <ReadoutBand
        className="mb-6"
        items={[
          { label: "Vigentes", value: count("vigente"), tone: "mint", hint: "Mais de 30 dias de validade" },
          { label: "Vencem em 30 dias", value: count("vencendo"), tone: count("vencendo") ? "brass" : undefined, hint: "Hora de renovar a ART" },
          { label: "Vencidos", value: count("vencido"), tone: count("vencido") ? "red" : undefined, hint: "Sem renovação registrada" },
          {
            label: "Equipamentos cobertos",
            value: current.reduce((n, r) => n + r.equipmentCount, 0),
            hint: "Nos documentos em vigor",
          },
        ]}
      />

      {missing.length > 0 && (
        <Panel
          className="mb-6 border-brass/30"
          title={
            <span className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-brass" />
              {missing.length === 1 ? "1 local com plano PMOC sem documento em vigor" : `${missing.length} locais com plano PMOC sem documento em vigor`}
            </span>
          }
          description="Os equipamentos estão em contrato com plano PMOC, mas falta o documento com responsável técnico e ART."
          flush
        >
          <ul className="divide-y divide-rime">
            {missing.map((m) => (
              <li key={`${m.customerId}:${m.siteId}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/admin/clientes/${m.customerId}`} className="text-sm font-medium text-silver hover:text-frost">
                    {m.customerName}
                  </Link>
                  <p className="text-xs text-steel">
                    {m.siteName ? `${m.siteName}, ` : ""}
                    {m.count === 1 ? "1 equipamento em plano PMOC" : `${m.count} equipamentos em plano PMOC`}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/pmoc/novo?customerId=${m.customerId}${m.siteId ? `&siteId=${m.siteId}` : ""}`}>Criar PMOC</Link>
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          param="situacao"
          options={[
            { value: "", label: "Todos", count: rows.length },
            { value: "vigente", label: "Vigentes", count: count("vigente") },
            { value: "vencendo", label: "Vencendo", count: count("vencendo") },
            { value: "vencido", label: "Vencidos", count: count("vencido") },
            ...(count("renovado") ? [{ value: "renovado", label: "Renovados", count: count("renovado") }] : []),
          ]}
        />
        <SearchInput placeholder="Buscar cliente, local ou ART" />
      </div>

      <Panel flush>
        {pageRows.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="size-6 text-frost" />}
            title={rows.length === 0 ? "Nenhum PMOC cadastrado" : "Nenhum PMOC encontrado"}
            description={
              rows.length === 0
                ? "Cadastre o PMOC de cada local climatizado com o responsável técnico e a ART. O documento é montado a partir dos equipamentos em plano PMOC."
                : "Tente outro termo de busca ou volte para a aba Todos."
            }
            action={rows.length === 0 ? newButton : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Cliente e local</TableHead>
                    <TableHead>Responsável técnico</TableHead>
                    <TableHead>ART</TableHead>
                    <TableHead>Vigência</TableHead>
                    <TableHead className="text-right">Equipamentos</TableHead>
                    <TableHead className="pr-5">Última OM de PMOC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map(({ doc, validity, equipmentCount, lastPmocAt }) => (
                    <TableRow key={doc.id} className="relative">
                      <TableCell className="max-w-72 pl-5">
                        <Link
                          href={`/admin/pmoc/${doc.id}`}
                          className="block truncate font-medium text-silver after:absolute after:inset-0 hover:text-frost"
                        >
                          {doc.customer.tradeName ?? doc.customer.name}
                        </Link>
                        <span className="block truncate text-xs text-steel">
                          {doc.site ? `${doc.site.name}${doc.site.district ? `, ${doc.site.district}` : ""}` : "Todos os locais"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block text-sm text-silver">{doc.responsibleName}</span>
                        <span className="block text-xs text-steel">{doc.responsibleRegistry ?? "Registro não informado"}</span>
                      </TableCell>
                      <TableCell className="readout text-sm text-steel">{doc.artNumber ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <ToneBadge tone={validity.tone}>{validity.label}</ToneBadge>
                          <span className="readout text-xs text-steel">
                            {formatDate(doc.validFrom)} a {formatDate(doc.validUntil)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="readout text-right text-sm text-silver">{equipmentCount}</TableCell>
                      <TableCell className="readout pr-5 text-sm text-steel">{lastPmocAt ? formatDate(lastPmocAt) : "Nenhuma"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-rime md:hidden">
              {pageRows.map(({ doc, validity, equipmentCount, lastPmocAt }) => (
                <li key={doc.id}>
                  <Link href={`/admin/pmoc/${doc.id}`} className="block px-4 py-3.5 active:bg-ice/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-silver">{doc.customer.tradeName ?? doc.customer.name}</p>
                        <p className="truncate text-xs text-steel">{doc.site?.name ?? "Todos os locais"}</p>
                      </div>
                      <ToneBadge tone={validity.tone}>{validity.label}</ToneBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-steel">
                      <span className="readout">
                        {formatDate(doc.validFrom)} a {formatDate(doc.validUntil)}
                      </span>
                      <span>
                        {equipmentCount} equip., última OM {lastPmocAt ? formatDate(lastPmocAt) : "nenhuma"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} />
      </Panel>
    </>
  );
}
