import { requireResourceKey } from "@auth/api-key";
import type { Permission } from "@auth/permissions";
import type { Tenant } from "@auth/tenant";
import { getAgent } from "@controllers/agents/repository";
import { getApiListing } from "@controllers/api-listings/repository";
import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import {
  getPolicy,
  listFaqs,
  ownsResource,
  type ResourceKind,
} from "@controllers/trust/repository";
import { appLogger } from "@logger/index";
import { priceAssetDecimals } from "@utils/price-asset";
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
    permission: Permission,
    run: (
      id: string,
      tenant: Tenant,
      request: Parameters<RouteHandler>[0],
      reply: Parameters<RouteHandler>[1],
    ) => Promise<unknown>,
  ): RouteHandler =>
  async (request, reply) => {
    const tenant = await requireTenant(request, reply, permission);
    if (!tenant) {
      return reply;
    }

    const { id } = request.params as { id: string };

    if (!(await ownsResource(kind, tenant.orgId, id))) {
      return notFound(reply, what(kind));
    }

    return run(id, tenant, request, reply);
  };

const resourceRef = (kind: ResourceKind, id: string) => ({
  [kind === "listing" ? "listingId" : "agentId"]: id,
});

export const listResourceKeysHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(
    kind,
    "resources.read",
    async (id, _tenant, _request, reply) =>
      reply.send({ items: await listResourceKeys(kind, id) }),
  );

export const createResourceKeyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(
    kind,
    "resources.write",
    async (id, tenant, request, reply) => {
      const parsed = parseBody(CreateResourceKeySchema, request.body);
      if (!parsed.success) {
        return invalidBody(reply, parsed.issues);
      }

      const { apiKey, plaintext } = await createResourceKey(
        tenant.orgId,
        tenant.userId,
        kind,
        id,
        parsed.data,
      );
      await audit(request, tenant, {
        action: "api_key.created",
        targetType: "api_key",
        targetId: apiKey.id,
        metadata: resourceRef(kind, id),
      });
      appLogger.info("API key created", {
        userId: tenant.userId,
        apiKeyId: apiKey.id,
        ...resourceRef(kind, id),
      });

      return reply.code(201).send({ apiKey, plaintext });
    },
  );

export const revokeResourceKeyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(
    kind,
    "resources.write",
    async (id, tenant, request, reply) => {
      const { keyId } = request.params as { keyId: string };
      const revoked = await revokeResourceKey(kind, id, keyId);

      if (revoked) {
        await audit(request, tenant, {
          action: "api_key.revoked",
          targetType: "api_key",
          targetId: keyId,
          metadata: resourceRef(kind, id),
        });
        appLogger.info("API key revoked", {
          userId: tenant.userId,
          apiKeyId: keyId,
        });
        return reply.send(revoked);
      }

      return notFound(reply, "active key");
    },
  );

export const deleteResourceKeyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(
    kind,
    "resources.write",
    async (id, tenant, request, reply) => {
      const { keyId } = request.params as { keyId: string };
      const deleted = await deleteResourceKey(kind, id, keyId);

      if (!deleted) {
        return notFound(reply, "key");
      }

      await audit(request, tenant, {
        action: "api_key.deleted",
        targetType: "api_key",
        targetId: keyId,
        metadata: resourceRef(kind, id),
      });
      return reply.code(204).send();
    },
  );

export const getResourceHandler: RouteHandler = async (request, reply) => {
  const key = requireResourceKey(request, reply);
  if (!key) {
    return reply;
  }

  const [listing, agent] = await Promise.all([
    key.kind === "listing" ? getApiListing(key.orgId, key.id) : null,
    key.kind === "agent" ? getAgent(key.orgId, key.id) : null,
  ]);

  if (!listing && !agent) {
    return notFound(reply, what(key.kind));
  }

  const [policy, faqs] = await Promise.all([
    getPolicy(key.kind, key.id),
    listFaqs(key.kind, key.id),
  ]);

  return reply.send({
    kind: key.kind,
    listing: listing && {
      ...listing,
      assetDecimals: priceAssetDecimals(listing),
    },
    agent: agent && { ...agent, assetDecimals: priceAssetDecimals(agent) },
    policy,
    faqs,
  });
};
