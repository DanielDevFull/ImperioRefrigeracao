import {
  AirVent,
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgePercent,
  CalendarRange,
  ClipboardList,
  FileSignature,
  HardHat,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const adminNav: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/admin", label: "Painel", icon: LayoutDashboard, exact: true },
      { href: "/admin/agenda", label: "Agenda", icon: CalendarRange },
      { href: "/admin/oms", label: "Ordens de manutenção", icon: ClipboardList },
      { href: "/admin/clientes", label: "Clientes", icon: Users },
      { href: "/admin/equipamentos", label: "Equipamentos", icon: AirVent },
      { href: "/admin/contratos", label: "Contratos", icon: FileSignature },
      { href: "/admin/planos", label: "Planos de manutenção", icon: ListChecks },
      { href: "/admin/pmoc", label: "PMOC", icon: ShieldCheck },
    ],
  },
  {
    label: "Estoque e compras",
    items: [
      { href: "/admin/estoque", label: "Estoque", icon: Package },
      { href: "/admin/compras", label: "Compras", icon: ShoppingCart },
      { href: "/admin/fornecedores", label: "Fornecedores", icon: Truck },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/admin/financeiro", label: "Visão geral", icon: Wallet, exact: true },
      { href: "/admin/financeiro/receber", label: "Contas a receber", icon: ArrowDownToLine },
      { href: "/admin/financeiro/pagar", label: "Contas a pagar", icon: ArrowUpFromLine },
    ],
  },
  {
    label: "Equipe",
    items: [
      { href: "/admin/tecnicos", label: "Técnicos", icon: HardHat },
      { href: "/admin/comissoes", label: "Comissões", icon: BadgePercent },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/usuarios", label: "Acessos", icon: KeyRound },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
