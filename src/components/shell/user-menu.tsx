"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";
import { initials } from "@/lib/format";
import { roleLabel } from "@/lib/labels";

export function UserMenu({ name, email, role, extra }: { name: string; email: string; role: string; extra?: React.ReactNode }) {
  const router = useRouter();
  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 outline-none transition-colors hover:bg-ice/10 md:pr-3">
        <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-ice/40 to-ice-deep/30 text-xs font-semibold text-silver ring-1 ring-ice/30">
          {initials(name)}
        </span>
        <span className="hidden text-left md:block">
          <span className="block max-w-36 truncate text-sm font-medium leading-tight text-silver">{name}</span>
          <span className="block text-[0.7rem] leading-tight text-steel">{roleLabel[role] ?? role}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm text-silver">{name}</span>
          <span className="block truncate text-xs text-steel">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {extra}
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

