"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markNotificationsRead } from "./actions";
import type { NotificationItem } from "./data";

export function NotificationsBell({ unread, items }: { unread: number; items: NotificationItem[] }) {
  const [, start] = useTransition();
  return (
    <Popover onOpenChange={(open) => !open && unread > 0 && start(() => markNotificationsRead())}>
      <PopoverTrigger
        className="relative grid size-10 place-items-center rounded-full text-steel transition-colors hover:bg-ice/10 hover:text-frost"
        aria-label={unread ? `${unread} notificações novas` : "Notificações"}
      >
        <Bell className="size-[1.15rem]" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-ice px-1 text-[0.625rem] font-semibold text-abyss"
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="border-b border-rime px-4 py-3 text-sm font-semibold">Notificações</div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-steel">Nenhuma notificação por enquanto.</li>}
          {items.map((n) => {
            const body = (
              <div className="flex gap-3 px-4 py-3">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-ice shadow-[0_0_8px_var(--ice)] light:shadow-[0_0_6px_var(--glow-ice)]")} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-silver">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-steel">{n.body}</p>}
                  <p className="mt-1 text-[0.7rem] text-steel/70 light:text-steel">{formatRelative(n.createdAt)}</p>
                </div>
              </div>
            );
            return (
              <li key={n.id} className="border-b border-rime/60 last:border-0">
                {n.link ? (
                  <Link href={n.link} className="block transition-colors hover:bg-ice/5">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
