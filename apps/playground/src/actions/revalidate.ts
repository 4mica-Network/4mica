"use server";

import { revalidatePath, updateTag } from "next/cache";
import { parseUsername } from "@/schema/params";
import { getViewer } from "@/services/viewer";
import { type ActionResult, profileTag } from "./shared";

/**
 * Drop the cached render of the caller's own profile.
 *
 * A "use server" export is a public HTTP endpoint, so the username is
 * re-validated and compared against the verified session rather than trusted
 * from the argument — otherwise anyone could evict anyone else's cache.
 */
export const revalidateProfile = async (
  username: string,
): Promise<ActionResult> => {
  const parsed = parseUsername(username);

  if (!parsed) {
    return { ok: false, error: "invalid_username" };
  }

  const viewer = await getViewer();

  if (!viewer || viewer.username !== parsed) {
    return { ok: false, error: "forbidden" };
  }

  // updateTag rather than revalidateTag: this runs in a server action, and
  // updateTag gives read-your-own-writes semantics so the owner sees the fresh
  // page on the very next render instead of one navigation later.
  updateTag(profileTag(parsed));
  revalidatePath(`/${parsed}`, "layout");

  return { ok: true };
};
