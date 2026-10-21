import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq, gt, ilike, inArray, max, or, sql, type SQL } from "drizzle-orm";
import { Building2, HardHat, KeyRound, Lock } from "lucide-react";
import { db } from "@/db";
import { session, user } from "@/db/schema";
import { EmptyState } from "@/components/system/empty-state";
import { FilterTabs, Pager, SearchInput } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ToneBadge } from "@/components/system/tone-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatRelative } from "@/lib/format";
import { roleLabel, type Tone } from "@/lib/labels";
import { PAGE_SIZE, pageFrom, param } from "@/lib/params";
import { AccessActions, type AccessRow } from "./_components/access-actions";
import { NewAccessDialog } from "./_components/new-access-dialog";

export const metadata: Metadata = { title: "Acessos" };

const ROLE_TONE: Record<string, Tone> = { admin: "ice", gestor: "violet", tecnico: "frost", cliente: "mint" };
const ROLE_ORDER = sql`case ${user.role} when 'admin' then 0 when 'gestor' then 1 when 'tecnico' then 2 else 3 end`;

const TABS = [
  { value: "", label: "Todos" },
  { value: "admin", label: "Administradores" },
  { value: "gestor", label: "Gestores" },
  { value: "tecnico", label: "Técnicos" },
  { value: "cliente", label: "Clientes" },
  { value: "bloqueados", label: "Bloqueados" },
] as const;

export default async function AccessesPage({ searchParams }: PageProps<"/admin/usuarios">) {
  const me = await requireStaff();
  const canManage = me.role === "admin";
  const sp = await searchParams;
  const perfil = param(sp, "perfil") ?? "";
  const q = param(sp, "q");
  const page = pageFrom(sp);

  const filters: (SQL | undefined)[] = [
    perfil === "bloqueados" ? eq(user.banned, true) : perfil ? eq(user.role, perfil) : undefined,
    q ? or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`)) : undefined,
  ];
  const where = and(...filters);

  const [rows, [{ total }], groups] = await Promise.all([
    db.query.user.findMany({
      where,
      with: {
        technician: { columns: { id: true, name: true } },
        customer: { columns: { id: true, name: true } },
      },
      orderBy: [asc(ROLE_ORDER), asc(user.name)],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    db.select({ total: count() }).from(user).where(where),
    db.select({ role: user.role, banned: user.banned, n: count() }).from(user).groupBy(user.role, user.banned),
  ]);

  const ids = rows.map((r) => r.id);
  const sessions = ids.length
    ? await db
        .select({ userId: session.userId, n: count(), last: max(session.updatedAt) })
        .from(session)
        .where(and(inArray(session.userId, ids), gt(session.expiresAt, new Date())))
        .groupBy(session.userId)
    : [];
  const sessionsBy = new Map(sessions.map((s) => [s.userId, s]));

  const countFor = (v: string) =>
    groups
      .filter((g) => (v === "" ? true : v === "bloqueados" ? g.banned : g.role === v))
      .reduce((n, g) => n + Number(g.n), 0);
  const tabs = TABS.map((t) => ({ value: t.value, label: t.label, count: countFor(t.value) }));

  const items = rows.map((r) => {
    const s = sessionsBy.get(r.id);
    const row: AccessRow = {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role ?? "cliente",
      banned: !!r.banned,
      sessions: Number(s?.n ?? 0),
      linked: r.technician ? "tecnico" : r.customer ? "cliente" : null,
    };
    return { row, raw: r, lastSeen: s?.last ?? null };
  });

  return (
    <>
      <PageHeader
        title="Acessos"
        description={
          canManage
            ? "Quem entra no sistema e com qual perfil. Técnicos e clientes recebem acesso pela própria ficha; aqui você cria os acessos da equipe interna."
            : "Quem entra no sistema e com qual perfil. Somente administradores criam, bloqueiam ou alteram acessos."
        }
        actions={canManage ? <NewAccessDialog /> : undefined}
      />

      {!canManage && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-rime bg-night/60 px-4 py-2.5 text-sm text-steel">
          <Lock className="size-4 shrink-0 text-brass" />
          Você está vendo os acessos em modo leitura. Para mudar algo, peça a um administrador.
        </p>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs param="perfil" options={tabs} />
        <SearchInput placeholder="Buscar por nome ou e-mail" />
      </div>

      <Panel flush>
        {items.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="size-6 text-frost" />}
            title={q || perfil ? "Nenhum acesso encontrado" : "Nenhum acesso cadastrado"}
            description={
              q || perfil
                ? "Tente outro nome ou e-mail, ou volte para a aba Todos."
                : "Crie o primeiro acesso da equipe para começar."
            }
            action={!q && !perfil && canManage ? <NewAccessDialog /> : undefined}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Pessoa</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Vínculo</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Situação</TableHead>
                    {canManage && <TableHead className="w-12 pr-5"><span className="sr-only">Ações</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(({ row, raw, lastSeen }) => (
                    <TableRow key={row.id} className={row.banned ? "opacity-70" : undefined}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-silver">{row.name}</span>
                          {row.id === me.id && <span className="rounded bg-ice/10 px-1.5 text-[0.7rem] text-ice">você</span>}
                        </div>
                        <div className="text-xs text-steel">{row.email}</div>
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={ROLE_TONE[row.role] ?? "steel"}>{roleLabel[row.role] ?? row.role}</ToneBadge>
                      </TableCell>
                      <TableCell>
                        <LinkedRecord raw={raw} role={row.role} />
                      </TableCell>
                      <TableCell className="text-sm text-steel">
                        {lastSeen ? formatRelative(lastSeen) : "Sem sessão aberta"}
                      </TableCell>
                      <TableCell className="readout text-sm text-steel">{formatDate(raw.createdAt)}</TableCell>
                      <TableCell>
                        <StatusBadge banned={row.banned} reason={raw.banReason} />
                      </TableCell>
                      {canManage && (
                        <TableCell className="pr-5 text-right">
                          <AccessActions row={row} isSelf={row.id === me.id} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Celular */}
            <ul className="divide-y divide-rime md:hidden">
              {items.map(({ row, raw, lastSeen }) => (
                <li key={row.id} className={row.banned ? "px-4 py-3.5 opacity-70" : "px-4 py-3.5"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-silver">
                        {row.name}
                        {row.id === me.id && <span className="ml-2 rounded bg-ice/10 px-1.5 text-[0.7rem] text-ice">você</span>}
                      </p>
                      <p className="truncate text-xs text-steel">{row.email}</p>
                    </div>
                    {canManage && <AccessActions row={row} isSelf={row.id === me.id} />}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ToneBadge tone={ROLE_TONE[row.role] ?? "steel"}>{roleLabel[row.role] ?? row.role}</ToneBadge>
                    <StatusBadge banned={row.banned} reason={raw.banReason} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-steel">
                    <LinkedRecord raw={raw} role={row.role} />
                    <span>{lastSeen ? `Último acesso ${formatRelative(lastSeen)}` : "Sem sessão aberta"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={Number(total)} />
      </Panel>
    </>
  );
}

function StatusBadge({ banned, reason }: { banned: boolean; reason: string | null }) {
  if (!banned) return <ToneBadge tone="mint">Ativo</ToneBadge>;
  return (
    <span title={reason ?? undefined}>
      <ToneBadge tone="red">Bloqueado</ToneBadge>
    </span>
  );
}

function LinkedRecord({
  raw,
  role,
}: {
  raw: { technician: { id: string; name: string } | null; customer: { id: string; name: string } | null };
  role: string;
}) {
  if (raw.technician)
    return (
      <Link
        href={`/admin/tecnicos/${raw.technician.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-frost hover:text-ice hover:underline"
      >
        <HardHat className="size-3.5 shrink-0 text-steel" />
        {raw.technician.name}
      </Link>
    );
  if (raw.customer)
    return (
      <Link
        href={`/admin/clientes/${raw.customer.id}`}
        className="inline-flex min-w-0 items-center gap-1.5 text-sm text-frost hover:text-ice hover:underline"
      >
        <Building2 className="size-3.5 shrink-0 text-steel" />
        <span className="truncate">{raw.customer.name}</span>
      </Link>
    );
  if (role === "admin" || role === "gestor") return <span className="text-sm text-steel">Equipe interna</span>;
  return (
    <span className="text-sm text-brass" title="Vincule este login na ficha do técnico ou do cliente">
      Sem cadastro vinculado
    </span>
  );
}
