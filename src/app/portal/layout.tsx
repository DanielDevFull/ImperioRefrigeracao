import type { Metadata } from "next";
import { getNotifications } from "@/components/shell/data";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import { PortalShell } from "@/components/shell/portal-shell";
import { UserMenu } from "@/components/shell/user-menu";
import { requireCustomer } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Portal do cliente", template: "%s · Imperium" } };

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { user } = await requireCustomer();
  const notes = await getNotifications(user.id);
  return (
    <PortalShell
      topbar={
        <>
          <NotificationsBell {...notes} />
          <UserMenu name={user.name} email={user.email} role={user.role} />
        </>
      }
    >
      {children}
    </PortalShell>
  );
}
