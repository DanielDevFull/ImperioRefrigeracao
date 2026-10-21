import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function getNotifications(userId: string) {
  const [items, [{ unread }]] = await Promise.all([
    db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: [desc(notifications.createdAt)],
      limit: 20,
    }),
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return {
    unread,
    items: items.map<NotificationItem>((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      read: Boolean(n.readAt),
      createdAt: n.createdAt.toISOString(),
    })),
  };
}
