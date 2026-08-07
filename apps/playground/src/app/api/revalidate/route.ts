import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { profileTag } from "@/actions/shared";
import { serverEnv } from "@/env";
import { parseUsername } from "@/schema/params";

export const dynamic = "force-dynamic";

/** Constant-time compare so the secret cannot be recovered byte by byte. */
const secretMatches = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Machine invalidation hook, so apps/be can drop a cached profile after
 * PATCH /me/profile without the owner having to press Refresh.
 *
 * Disabled unless REVALIDATE_SECRET is set — an unset secret must not mean
 * "anyone may call this".
 */
export async function POST(request: NextRequest) {
  const { REVALIDATE_SECRET } = serverEnv();

  if (!REVALIDATE_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
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

  // A route handler is not a server action, so updateTag is unavailable here.
  // "max" purges the entry regardless of the cache life it was written with.
  revalidateTag(profileTag(username), "max");
  revalidatePath(`/${username}`, "layout");

  return NextResponse.json({ revalidated: true, username });
}
