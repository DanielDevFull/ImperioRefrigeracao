import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, Package, Smartphone } from "lucide-react";
import { getNotifications } from "@/components/shell/data";
import { requireTechnician } from "@/lib/auth/session";
import { formatNumber, formatPhone, formatRelative, initials } from "@/lib/format";
import { productCategory } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { vehicleStock } from "../_lib/queries";
import { InstallHint, SignOutButton } from "./_components/profile-actions";

export const metadata: Metadata = { title: "Perfil" };

export default async function TechProfilePage() {
  const { user, technician } = await requireTechnician();
  const [stock, notes] = await Promise.all([vehicleStock(technician.id), getNotifications(user.id)]);
  const latest = notes.items.slice(0, 4);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4 pt-1">
        <span
          className="grid size-16 shrink-0 place-items-center rounded-full text-xl font-semibold text-abyss ring-4 ring-abyss"
          style={{ background: `linear-gradient(160deg, ${technician.color}, #1677d6)` }}
          aria-hidden
        >
          {initials(technician.name)}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-silver-brushed truncate text-2xl font-semibold leading-tight">{technician.name}</h1>
          <p className="mt-0.5 text-sm text-steel">Técnico Imperium</p>
        </div>
      </header>

      <section className="panel divide-y divide-rime overflow-hidden" aria-label="Seus dados">
        {[
          ["E-mail", technician.email ?? user.email],
          ["Telefone", technician.phone ? formatPhone(technician.phone) : "Não informado"],
          ["Placa do veículo", technician.vehiclePlate ?? "Sem veículo cadastrado"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3.5">
            <span className="text-sm text-steel">{label}</span>
            <span className={cn("min-w-0 truncate text-right text-[0.95rem] text-silver", label === "Placa do veículo" && "readout tracking-wider")}>{value}</span>
          </div>
        ))}
        <p className="px-4 py-3 text-xs text-steel">Para mudar seus dados ou a senha, fale com o escritório.</p>
      </section>

      <section aria-labelledby="p-estoque" className="space-y-3">
        <div>
          <h2 id="p-estoque" className="font-display text-silver-brushed text-xl font-semibold">
            Estoque do veículo
          </h2>
          <p className="mt-0.5 truncate text-xs text-steel">{stock.location.name}</p>
        </div>
        {stock.rows.length === 0 ? (
          <p className="panel flex items-center gap-3 px-4 py-5 text-sm text-steel">
            <Package className="size-5 shrink-0 text-steel" />
            Nenhum material no seu veículo. Peça ao escritório uma transferência do almoxarifado.
          </p>
        ) : (
          <ul className="panel divide-y divide-rime overflow-hidden">
            {stock.rows.map((r) => {
              const low = r.quantity < 0 || (r.product.minStock > 0 && r.quantity <= r.product.minStock / 4);
              return (
                <li key={r.productId} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.95rem] text-silver">{r.product.name}</p>
                    <p className="text-xs text-steel">{productCategory[r.product.category] ?? r.product.category}</p>
                  </div>
                  <span className={cn("readout shrink-0 text-[0.95rem] font-semibold", r.quantity < 0 ? "text-gauge-red" : low ? "text-brass" : "text-silver")}>
                    {formatNumber(r.quantity)} {r.product.unit}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {stock.rows.some((r) => r.quantity < 0) && (
          <p className="text-xs text-gauge-red">Saldo negativo: você lançou mais do que o sistema tinha no veículo. Avise o escritório para acertar.</p>
        )}
      </section>

      <section aria-labelledby="p-notif" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="p-notif" className="font-display text-silver-brushed text-xl font-semibold">
            Notificações
          </h2>
          {notes.unread > 0 && <span className="text-sm text-ice">{notes.unread === 1 ? "1 nova" : `${notes.unread} novas`}</span>}
        </div>
        {latest.length === 0 ? (
          <p className="panel flex items-center gap-3 px-4 py-5 text-sm text-steel">
            <Bell className="size-5 shrink-0" />
            Nenhuma notificação por enquanto. Avisamos aqui quando uma OM for atribuída a você.
          </p>
        ) : (
          <ul className="panel divide-y divide-rime overflow-hidden">
            {latest.map((n) => {
              const body = (
                <>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-steel/30" : "bg-ice shadow-[0_0_8px_var(--ice)]")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.95rem] text-silver">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-steel">{n.body}</span>}
                    <span className="mt-0.5 block text-[0.7rem] text-steel/70">{formatRelative(n.createdAt)}</span>
                  </span>
                  {n.link && <ChevronRight className="mt-1 size-4 shrink-0 text-steel" />}
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="flex min-h-14 gap-3 px-4 py-3 active:bg-ice/5">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex min-h-14 gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-steel">A lista completa fica no sino, no topo da tela.</p>
      </section>

      <section aria-labelledby="p-app" className="panel space-y-3 p-4">
        <h2 id="p-app" className="flex items-center gap-2 text-[0.95rem] font-semibold text-silver">
          <Smartphone className="size-4 text-ice" />
          Instalar o app
        </h2>
        <InstallHint />
      </section>

      <SignOutButton />
    </div>
  );
}
