import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  contractEquipment,
  contracts,
  customerSites,
  customers,
  equipment,
  receivables,
  session,
  technicians,
  user,
  workOrders,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { normalizeDocument, onlyDigits } from "@/lib/format";
import { activeWorkOrderStatuses, effectiveFinanceStatus } from "@/lib/labels";
import { PAGE_SIZE } from "@/lib/params";

export type CustomerFilter = "" | "contrato" | "sem-contrato" | "inativos";

/** Referência qualificada ao cliente da consulta externa (o drizzle omite a tabela nas colunas do select). */
const CID = sql.raw(`"customers"."id"`);
const hasActiveContract = sql`exists (select 1 from ${contracts} ct where ct.customer_id = ${CID} and ct.status = 'ativo')`;

function searchCondition(q: string | undefined): SQL | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  const like = `%${term}%`;
  const parts: (SQL | undefined)[] = [
    ilike(customers.name, like),
    ilike(customers.tradeName, like),
    ilike(customers.email, like),
  ];
  const digits = onlyDigits(term);
  if (digits.length >= 3) {
    const dl = `%${digits}%`;
    parts.push(ilike(customers.document, dl), ilike(customers.phone, dl), ilike(customers.whatsapp, dl));
  }
  // CNPJ alfanumérico: o documento é salvo normalizado, com as letras
  const doc = normalizeDocument(term);
  if (doc !== digits && doc.length >= 3 && /\d/.test(doc)) parts.push(ilike(customers.document, `%${doc}%`));
  const code = /^cli-?0*(\d+)$/i.exec(term)?.[1];
  if (code) parts.push(eq(customers.code, Number(code)));
  return or(...parts);
}

function filterCondition(filter: CustomerFilter): SQL | undefined {
  switch (filter) {
    case "contrato":
      return hasActiveContract;
    case "sem-contrato":
      return and(eq(customers.status, "ativo"), sql`not ${hasActiveContract}`);
    case "inativos":
      return eq(customers.status, "inativo");
    default:
      return undefined;
  }
}

export async function customerTabCounts(q: string | undefined) {
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      contrato: sql<number>`(count(*) filter (where ${hasActiveContract}))::int`,
      semContrato: sql<number>`(count(*) filter (where ${customers.status} = 'ativo' and not ${hasActiveContract}))::int`,
      inativos: sql<number>`(count(*) filter (where ${customers.status} = 'inativo'))::int`,
    })
    .from(customers)
    .where(searchCondition(q));
  return row ?? { all: 0, contrato: 0, semContrato: 0, inativos: 0 };
}

export async function listCustomers({ q, filter, page }: { q?: string; filter: CustomerFilter; page: number }) {
  const today = todayISO();
  const where = and(searchCondition(q), filterCondition(filter));
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where);

  const rows = await db
    .select({
      id: customers.id,
      code: customers.code,
      name: customers.name,
      tradeName: customers.tradeName,
      personType: customers.personType,
      document: customers.document,
      phone: customers.phone,
      status: customers.status,
      hasPortal: sql<boolean>`${customers.userId} is not null`,
      district: sql<string | null>`(select s.district from ${customerSites} s where s.customer_id = ${CID} order by s.is_primary desc, s.created_at limit 1)`,
      city: sql<string | null>`(select s.city from ${customerSites} s where s.customer_id = ${CID} order by s.is_primary desc, s.created_at limit 1)`,
      equipmentCount: sql<number>`(select count(*)::int from ${equipment} e where e.customer_id = ${CID} and e.status <> 'removido')`,
      activeContracts: sql<number>`(select count(*)::int from ${contracts} ct where ct.customer_id = ${CID} and ct.status = 'ativo')`,
      monthlyAmount: sql<number>`(select coalesce(sum(ct.monthly_amount), 0)::float8 from ${contracts} ct where ct.customer_id = ${CID} and ct.status = 'ativo')`,
      overdueCount: sql<number>`(select count(*)::int from ${receivables} r where r.customer_id = ${CID} and r.status = 'aberto' and r.due_date < ${today}::date)`,
      overdueAmount: sql<number>`(select coalesce(sum(r.amount - r.discount), 0)::float8 from ${receivables} r where r.customer_id = ${CID} and r.status = 'aberto' and r.due_date < ${today}::date)`,
    })
    .from(customers)
    .where(where)
    .orderBy(sql`lower(coalesce(${customers.tradeName}, ${customers.name}))`)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return { rows, total };
}

export type CustomerListRow = Awaited<ReturnType<typeof listCustomers>>["rows"][number];

export async function activeTechnicians() {
  return db
    .select({ id: technicians.id, name: technicians.name })
    .from(technicians)
    .where(eq(technicians.active, true))
    .orderBy(asc(technicians.name));
}

/** Quantos registros ligados ao cliente (OMs, cobranças, contratos, equipamentos). */
export async function customerHistoryCount(id: string) {
  const rows = await db.execute<{ n: number }>(sql`select (
    (select count(*) from ${workOrders} w where w.customer_id = ${id}) +
    (select count(*) from ${receivables} r where r.customer_id = ${id}) +
    (select count(*) from ${contracts} ct where ct.customer_id = ${id}) +
    (select count(*) from ${equipment} e where e.customer_id = ${id})
  )::int as n`);
  return Number(rows[0]?.n ?? 0);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Evita erro do Postgres com ids malformados na URL (vira 404). */
export const isUuid = (v: string | null | undefined): v is string => Boolean(v && UUID_RE.test(v));

export async function getCustomerForEdit(id: string) {
  if (!isUuid(id)) return undefined;
  return db.query.customers.findFirst({ where: eq(customers.id, id) });
}

/** Tudo o que a ficha do cliente mostra, em poucas consultas. */
export async function getCustomerDetail(id: string) {
  if (!isUuid(id)) return null;
  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, id),
    with: {
      defaultTechnician: { columns: { id: true, name: true } },
      user: { columns: { id: true, email: true, name: true, createdAt: true, banned: true } },
    },
  });
  if (!customer) return null;
  const today = todayISO();

  const [sites, equipmentRows, contractRows, workOrderRows, receivableRows, lastSession] = await Promise.all([
    db.query.customerSites.findMany({
      where: eq(customerSites.customerId, id),
      orderBy: [desc(customerSites.isPrimary), asc(customerSites.createdAt)],
    }),
    db.query.equipment.findMany({
      where: eq(equipment.customerId, id),
      with: {
        type: { columns: { name: true, icon: true } },
        site: { columns: { name: true } },
        contractLinks: {
          where: eq(contractEquipment.active, true),
          with: {
            contract: { columns: { id: true, code: true, name: true, status: true } },
            plan: { columns: { id: true, name: true } },
          },
        },
      },
      orderBy: [asc(equipment.code)],
    }),
    db.query.contracts.findMany({
      where: eq(contracts.customerId, id),
      with: { items: { where: eq(contractEquipment.active, true), columns: { id: true } } },
      orderBy: [desc(contracts.startDate)],
    }),
    db.query.workOrders.findMany({
      where: eq(workOrders.customerId, id),
      with: {
        technician: { columns: { name: true } },
        equipment: { columns: { code: true, location: true } },
      },
      orderBy: [desc(workOrders.number)],
      limit: 40,
    }),
    db.query.receivables.findMany({
      where: eq(receivables.customerId, id),
      orderBy: [desc(receivables.dueDate)],
    }),
    customer.userId
      ? db
          .select({ at: session.updatedAt })
          .from(session)
          .where(eq(session.userId, customer.userId))
          .orderBy(desc(session.updatedAt))
          .limit(1)
          .then((r) => r[0]?.at ?? null)
      : Promise.resolve(null),
  ]);

  // Visitas: última concluída e próxima em aberto (entre todas as OMs do cliente, não só as 30 recentes)
  const [lastVisit] = await db
    .select({
      id: workOrders.id,
      number: workOrders.number,
      finishedAt: workOrders.finishedAt,
      technician: technicians.name,
    })
    .from(workOrders)
    .leftJoin(technicians, eq(technicians.id, workOrders.technicianId))
    .where(and(eq(workOrders.customerId, id), eq(workOrders.status, "concluida")))
    .orderBy(desc(workOrders.finishedAt))
    .limit(1);
  const [nextVisit] = await db
    .select({
      id: workOrders.id,
      number: workOrders.number,
      date: sql<string | null>`coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate})`,
      status: workOrders.status,
      technician: technicians.name,
    })
    .from(workOrders)
    .leftJoin(technicians, eq(technicians.id, workOrders.technicianId))
    .where(
      and(
        eq(workOrders.customerId, id),
        inArray(workOrders.status, [...activeWorkOrderStatuses]),
      ),
    )
    .orderBy(sql`coalesce(${workOrders.scheduledDate}, ${workOrders.dueDate}) asc nulls last`)
    .limit(1);

  const finance = receivableRows.map((r) => ({
    ...r,
    effectiveStatus: effectiveFinanceStatus(r.status, r.dueDate, today),
    net: Math.round((r.amount - r.discount) * 100) / 100,
  }));
  const totals = {
    open: sum(finance.filter((r) => r.effectiveStatus === "aberto" || r.effectiveStatus === "em_analise").map((r) => r.net)),
    overdue: sum(finance.filter((r) => r.effectiveStatus === "vencido").map((r) => r.net)),
    overdueCount: finance.filter((r) => r.effectiveStatus === "vencido").length,
    paid: sum(finance.filter((r) => r.status === "pago").map((r) => r.paidAmount ?? r.net)),
  };

  const activeContracts = contractRows.filter((c) => c.status === "ativo");
  const historyCounts = {
    workOrders: workOrderRows.length,
    receivables: receivableRows.length,
    contracts: contractRows.length,
    equipment: equipmentRows.length,
  };

  // Contas de usuário do portal: só para o e-mail sugerido não colidir
  return {
    customer,
    sites,
    equipment: equipmentRows,
    contracts: contractRows,
    activeContracts,
    monthlyAmount: sum(activeContracts.map((c) => c.monthlyAmount)),
    workOrders: workOrderRows,
    finance,
    totals,
    lastVisit: lastVisit ?? null,
    nextVisit: nextVisit ?? null,
    lastSessionAt: lastSession,
    historyCounts,
    today,
  };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>;

function sum(values: number[]) {
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}

/** O usuário (login) com este e-mail, se existir. */
export async function findUserByEmail(email: string) {
  return db.query.user.findFirst({ where: eq(user.email, email.toLowerCase()) });
}
