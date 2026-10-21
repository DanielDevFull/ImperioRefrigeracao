import { NextResponse, type NextRequest } from "next/server";
import { runDaily } from "@/server/daily";

export const maxDuration = 300;

/** Vercel Cron: envia "Authorization: Bearer $CRON_SECRET". */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const summary = await runDaily("cron");
  return NextResponse.json({ ok: true, summary });
}
