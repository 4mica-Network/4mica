import { LinkConfig } from "@4mica/url";
import { permanentRedirect } from "next/navigation";

/**
 * The apex root document belongs to apps/web — nginx.conf proxies `location = /`
 * there and this app never receives it in production. The route exists only so a
 * direct hit on the playground origin (dev, or the container port) lands
 * somewhere real.
 *
 * The target is resolved from an empty env on purpose, so it is always the
 * canonical https://4mica.io rather than `links.website`. NEXT_PUBLIC_BASE_URL
 * is *this app's own* public origin — it is the apex only in production, and
 * locally it is http://localhost:3100, which would make this redirect loop.
 */
const MARKETING_HOME = new LinkConfig({}).links.website;

export default function HomePage(): never {
  permanentRedirect(MARKETING_HOME);
}
