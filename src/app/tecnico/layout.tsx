import type { Metadata } from "next";
import { getNotifications } from "@/components/shell/data";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import { TechShell } from "@/components/shell/tech-shell";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { requireTechnician } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "App do técnico", template: "%s · Imperium" },
  manifest: "/manifest.webmanifest",
};

export default async function TechLayout({ children }: LayoutProps<"/tecnico">) {
  const { user } = await requireTechnician();
  const notes = await getNotifications(user.id);
  return (
    <TechShell topbar={<NotificationsBell {...notes} />}>
      <RegisterServiceWorker />
      {children}
    </TechShell>
  );
}
