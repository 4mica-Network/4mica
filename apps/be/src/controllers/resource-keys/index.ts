import { requireResourceKey } from "@auth/api-key";
import { getAgent } from "@controllers/agents/repository";
import { getApiListing } from "@controllers/api-listings/repository";
import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import {
  getPolicy,
  listFaqs,
  ownsResource,
  type ResourceKind,
} from "@controllers/trust/repository";
import { appLogger } from "@logger/index";
import type { RouteHandler } from "fastify";
import {
  createResourceKey,
  deleteResourceKey,
  listResourceKeys,
  revokeResourceKey,
} from "./repository";
import { CreateResourceKeySchema } from "./schema";

const what = (kind: ResourceKind) =>
  kind === "listing" ? "API listing" : "agent";

const withOwnedResource =
  (
    kind: ResourceKind,
    run: (
      id: string,
      userId: string,
      request: Parameters<RouteHandler>[0],
      reply: Parameters<RouteHandler>[1],
    ) => Promise<unknown>,
  ): RouteHandler =>
  async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return reply;
    }

    const { id } = request.params as { id: string };

    if (!(await ownsResource(kind, userId, id))) {
      return notFound(reply, what(kind));
    }

    return run(id, userId, request, reply);
  };

export const listResourceKeysHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, _userId, _request, reply) =>
    reply.send({ items: await listResourceKeys(kind, id) }),
  );

export const createResourceKeyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, userId, request, reply) => {
    const parsed = parseBody(CreateResourceKeySchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    const { apiKey, plaintext } = await createResourceKey(
      userId,
      kind,
      id,
      parsed.data,
    );
    appLogger.info("API key created", {
      userId,
      apiKeyId: apiKey.id,
      [kind === "listing" ? "listingId" : "agentId"]: id,
    });

    return reply.code(201).send({ apiKey, plaintext });
  });

export const revokeResourceKeyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, userId, request, reply) => {
    const { keyId } = request.params as { keyId: string };
    const revoked = await revokeResourceKey(kind, id, keyId);

    if (revoked) {
      appLogger.info("API key revoked", { userId, apiKeyId: keyId });
      return reply.send(revoked);
    }

    return notFound(reply, "active key");
  });

export const deleteResourceKeyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, _userId, request, reply) => {
    const { keyId } = request.params as { keyId: string };
    const deleted = await deleteResourceKey(kind, id, keyId);

    return deleted ? reply.code(204).send() : notFound(reply, "key");
  });

export const getResourceHandler: RouteHandler = async (request, reply) => {
  const key = requireResourceKey(request, reply);
  if (!key) {
    return reply;
  }

  const [listing, agent] = await Promise.all([
    key.kind === "listing" ? getApiListing(key.ownerId, key.id) : null,
    key.kind === "agent" ? getAgent(key.ownerId, key.id) : null,
  ]);

  if (!listing && !agent) {
    return notFound(reply, what(key.kind));
  }

  const [policy, faqs] = await Promise.all([
    getPolicy(key.kind, key.id),
    listFaqs(key.kind, key.id),
  ]);

  return reply.send({ kind: key.kind, listing, agent, policy, faqs });
};
