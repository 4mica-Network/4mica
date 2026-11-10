import { requireUserId } from "@controllers/shared";
import { getConfig } from "@utils/config/index";
import type { RouteHandler } from "fastify";

export const CONFIG_CACHE_CONTROL =
  "private, max-age=3600, stale-while-revalidate=86400";

const matchesEtag = (header: string | undefined, etag: string): boolean =>
  (header ?? "")
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === etag || tag === "*");

export const getConfigHandler: RouteHandler = async (request, reply) => {
  if (!requireUserId(request, reply)) {
    return reply;
  }

  const config = getConfig();
  const etag = `"${config.version}"`;

  reply.header("cache-control", CONFIG_CACHE_CONTROL);
  reply.header("etag", etag);
  reply.header("vary", "Authorization");

  if (matchesEtag(request.headers["if-none-match"], etag)) {
    return reply.code(304).send();
  }

  return reply.send(config);
};
