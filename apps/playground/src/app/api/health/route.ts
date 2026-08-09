import { NextResponse } from "next/server";
import { prisma } from "@/services/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let db: "ok" | "down" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }

  const body = {
    status: db === "ok" ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db,
  };

  return NextResponse.json(body, { status: db === "ok" ? 200 : 503 });
}
