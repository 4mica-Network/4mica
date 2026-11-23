import {
  type PlaygroundResource,
  revalidatePlayground,
} from "@services/playground";
import type { FastifyInstance, onResponseAsyncHookHandler } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    staleUsernames: string[] | null;
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const RESOURCE_ROUTES: { pattern: RegExp; kind: PlaygroundResource["kind"] }[] =
  [
    { pattern: /\/me\/agents\/:id(\/|$)/, kind: "agent" },
    { pattern: /\/me\/api-listings\/:id(\/|$)/, kind: "listing" },
  ];

export const resourcesOf = (
  route: string | undefined,
  params: unknown,
): PlaygroundResource[] => {
  const id = (params as { id?: unknown } | null)?.id;

  if (!route || typeof id !== "string") {
    return [];
  }

  return RESOURCE_ROUTES.filter(({ pattern }) => pattern.test(route)).map(
    ({ kind }) => ({ kind, id }),
  );
};

export const registerPlaygroundRevalidation = (app: FastifyInstance): void => {
  app.decorateRequest("staleUsernames", null);
};

export const revalidateOnWrite: onResponseAsyncHookHandler = async (
  request,
  reply,
) => {
  if (
    !request.user ||
    !MUTATING_METHODS.has(request.method) ||
    reply.statusCode >= 400
  ) {
    return;
  }

  const resources = resourcesOf(request.routeOptions.url, request.params);

  await revalidatePlayground({
    ownerId: request.user.id,
    ...(request.staleUsernames?.length
      ? { usernames: request.staleUsernames }
      : {}),
    ...(resources.length ? { resources } : {}),
  });
};
