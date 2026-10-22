import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { customers, receivables, technicians, workOrderPhotos, workOrders } from "@/db/schema";
import { getCurrentUser, STAFF_ROLES } from "@/lib/auth/session";
import { FILES_PREFIX, readStoredFile } from "@/lib/storage";

/**
 * Serve arquivos privados (fotos, assinaturas, comprovantes, anexos) só para quem pode vê-los:
 * equipe interna; o técnico da OM; o cliente dono da OM/comprovante/equipamento.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/arquivos/[...path]">) {
  const { path } = await ctx.params;
  const name = path.join("/");
  const url = FILES_PREFIX + name;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Não autorizado", { status: 401 });

  if (!STAFF_ROLES.includes(user.role) && !(await canAccess(user.id, user.role, name, url))) {
    return new NextResponse("Arquivo não encontrado", { status: 404 });
  }
  const file = await readStoredFile(name);
  if (!file) return new NextResponse("Arquivo não encontrado", { status: 404 });
  return new NextResponse(file.body as BodyInit, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

async function canAccess(userId: string, role: string, name: string, url: string) {
  const folder = name.split("/")[0];
  if (folder === "anexos") return false;

  const technician =
    role === "tecnico" ? await db.query.technicians.findFirst({ where: eq(technicians.userId, userId), columns: { id: true } }) : null;
  const customer =
    role === "cliente" ? await db.query.customers.findFirst({ where: eq(customers.userId, userId), columns: { id: true } }) : null;
  if (!technician && !customer) return false;

  const ownsWorkOrder = (wo: { technicianId: string | null; customerId: string } | undefined) =>
    Boolean(wo && ((technician && wo.technicianId === technician.id) || (customer && wo.customerId === customer.id)));

  if (folder === "om") {
    const photo = await db.query.workOrderPhotos.findFirst({
      where: eq(workOrderPhotos.url, url),
      with: { workOrder: { columns: { technicianId: true, customerId: true } } },
    });
    return ownsWorkOrder(photo?.workOrder);
  }
  if (folder === "assinaturas") {
    const wo = await db.query.workOrders.findFirst({
      where: eq(workOrders.signatureUrl, url),
      columns: { technicianId: true, customerId: true },
    });
    return ownsWorkOrder(wo);
  }
  if (folder === "comprovantes") {
    if (!customer) return false;
    const rec = await db.query.receivables.findFirst({
      where: and(eq(receivables.proofUrl, url), eq(receivables.customerId, customer.id)),
      columns: { id: true },
    });
    return Boolean(rec);
  }
  if (folder === "equipamentos") {
    // foto do aparelho: o cliente dono ou técnico com OM nesse equipamento
    const eq_ = await db.query.equipment.findFirst({
      where: (e, { eq: eqf }) => eqf(e.photoUrl, url),
      columns: { id: true, customerId: true },
    });
    if (!eq_) return false;
    if (customer) return eq_.customerId === customer.id;
    const wo = await db.query.workOrders.findFirst({
      where: and(eq(workOrders.equipmentId, eq_.id), eq(workOrders.technicianId, technician!.id)),
      columns: { id: true },
    });
    return Boolean(wo);
  }
  return false;
}

