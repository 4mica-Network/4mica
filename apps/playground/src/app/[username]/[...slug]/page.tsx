import { notFound } from "next/navigation";

/**
 * `/<username>/<anything else>` — 404 via the profile's own not-found page.
 *
 * The layout above still runs first, so an unknown sub-path under a private or
 * non-existent handle 404s at the profile gate rather than here, and never
 * reveals that the handle exists.
 */
export default async function ProfileCatchAll() {
  notFound();
}
