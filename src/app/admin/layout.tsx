import type { Metadata } from "next";
import { AdminShell } from "@/components/shell/admin-shell";
import { getNotifications } from "@/components/shell/data";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import { RunDailyButton } from "@/components/shell/run-daily-button";
import { UserMenu } from "@/components/shell/user-menu";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Imperium" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();
  const notes = await getNotifications(user.id);
  return (
    <AdminShell
      topbar={
        <>
          <RunDailyButton />
          <NotificationsBell {...notes} />
          <UserMenu name={user.name} email={user.email} role={user.role} />
        </>
      }
    >
      {children}
    </AdminShell>
  );
}
