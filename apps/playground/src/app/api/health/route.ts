import { NextResponse } from "next/server";
import { prisma } from "@/services/db";

// Reports live state, so it must never be cached or statically evaluated.
export const dynamic = "force-dynamic";

/**
 * Liveness plus database readiness, mirroring the shape of
 * apps/be/src/controllers/health. Used by the docker-compose healthcheck.
 */
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
