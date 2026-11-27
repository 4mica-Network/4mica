import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { profileTag } from "@/actions/shared";
import { serverEnv } from "@/env.server";
import { parseUsername } from "@/schema/params";
import { RevalidateBodySchema } from "@/schema/revalidate";
import { organizationTag, resourceTag } from "@/services/cache";
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

  const parsed = v.safeParse(
    RevalidateBodySchema,
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { organizationId, resources = [] } = parsed.output;
  const username = parseUsername(parsed.output.username);
  const usernames = (parsed.output.usernames ?? [])
    .map(parseUsername)
    .filter((handle): handle is string => handle !== null);

  if (!organizationId && !username && usernames.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const organization = organizationId
    ? await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, handle: true },
      })
    : username
      ? await prisma.organization.findUnique({
          where: { handle: username },
          select: { id: true, handle: true },
        })
      : null;

  const staleOrganizationId = organizationId ?? organization?.id;
  const handles = new Set(
    [username, ...usernames, organization?.handle].filter(
      (handle): handle is string => Boolean(handle),
    ),
  );

  if (staleOrganizationId) {
    revalidateTag(organizationTag(staleOrganizationId), { expire: 0 });
  }

  for (const handle of handles) {
    revalidateTag(profileTag(handle), { expire: 0 });
    revalidatePath(`/${handle}`, "layout");
  }

  for (const { kind, id } of resources) {
    revalidateTag(resourceTag(kind, id), { expire: 0 });
  }

  return NextResponse.json({ revalidated: true, usernames: [...handles] });
}
