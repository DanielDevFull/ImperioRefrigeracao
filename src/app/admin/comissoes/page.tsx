import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { commissionPayouts, commissionRules } from "@/db/schema";
import { FilterTabs } from "@/components/system/list-controls";
import { PageHeader } from "@/components/system/page-header";
import { competenceOf, todayISO } from "@/lib/dates";
import { pageFrom, param } from "@/lib/params";
import { technicianOptions } from "../tecnicos/_lib/queries";
import { Extrato } from "./_components/extrato";
import { Fechamentos } from "./_components/fechamentos";
import { ParamSelect, PeriodPicker } from "./_components/period-controls";
import { Regras } from "./_components/regras";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Comissões" };

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ComissoesPage({ searchParams }: PageProps<"/admin/comissoes">) {
  await requireStaff();
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "";
  const current = competenceOf(todayISO());
  const rawPeriod = param(sp, "periodo");
  const period = rawPeriod && PERIOD.test(rawPeriod) && rawPeriod <= current ? rawPeriod : current;
  const rawTech = param(sp, "tecnico");
  const technicianId = rawTech && UUID.test(rawTech) ? rawTech : undefined;
  const page = pageFrom(sp);

  const [techs, [{ openPayouts }], [{ activeRules }]] = await Promise.all([
    technicianOptions(),
    db
      .select({ openPayouts: sql<number>`count(*)::int` })
      .from(commissionPayouts)
      .where(eq(commissionPayouts.status, "aberto")),
    db.select({ activeRules: sql<number>`count(*)::int` }).from(commissionRules).where(eq(commissionRules.active, true)),
  ]);

  return (
    <>
      <PageHeader
        title="Comissões"
        description="Extrato do mês, fechamentos para pagamento e as regras que calculam a comissão de cada OM."
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          param="tab"
          options={[
            { value: "", label: "Extrato" },
            { value: "fechamentos", label: "Fechamentos", count: openPayouts || undefined },
            { value: "regras", label: "Regras", count: activeRules },
          ]}
        />
        {tab !== "regras" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {tab !== "fechamentos" && <PeriodPicker period={period} current={current} />}
            <ParamSelect
              param="tecnico"
              label="Filtrar por técnico"
              placeholder="Todos os técnicos"
              value={technicianId ?? ""}
              options={techs.map((t) => ({ value: t.id, label: t.active ? t.name : `${t.name} (inativo)` }))}
            />
          </div>
        )}
      </div>

      {tab === "fechamentos" ? (
        <Fechamentos technicianId={technicianId} page={page} />
      ) : tab === "regras" ? (
        <Regras />
      ) : (
        <Extrato period={period} current={current} technicianId={technicianId} page={page} />
      )}
    </>
  );
}
