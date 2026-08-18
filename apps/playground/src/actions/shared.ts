/**
 * Shared helpers and types for the server actions.
 *
 * Deliberately NOT marked "use server": in such a file every export must be an
 * async function, so a sync helper like `profileTag` living beside the actions
 * fails the build with "Server Actions must be async functions". This module
 * is also imported by the /api/revalidate route handler, which is not an
 * action at all.
 *
 * Mirrors the apps/be/src/controllers/shared.ts convention.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Cache tag for one profile's rendered pages. */
export const profileTag = (username: string): string => `profile:${username}`;
