import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { profileTag } from "@/actions/shared";
import { serverEnv } from "@/env.server";
import { parseUsername } from "@/schema/params";
import { ownerTag } from "@/services/cache";
import { prisma } from "@/services/db";

export const dynamic = "force-dynamic";

const secretMatches = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(request: NextRequest) {
  const { REVALIDATE_SECRET } = serverEnv();

  if (!REVALIDATE_SECRET) {
    return new NextResponse(null, { status: 404 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!secretMatches(token, REVALIDATE_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const username = parseUsername(
    (body as { username?: unknown } | null)?.username,
  );

  if (!username) {
    return NextResponse.json({ error: "invalid_username" }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  revalidateTag(profileTag(username), { expire: 0 });

  if (owner) {
    revalidateTag(ownerTag(owner.id), { expire: 0 });
  }

  revalidatePath(`/${username}`, "layout");

  return NextResponse.json({ revalidated: true, username });
}
