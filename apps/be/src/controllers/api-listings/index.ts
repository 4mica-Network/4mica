import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { isUniqueViolation } from "@services/prisma-errors";
import {
  resolveSellerWallet,
  sellerWalletError,
} from "@services/seller-wallet";
import { nextFreeSlug, slugify } from "@services/slug";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  batchSoftDeleteApiListings,
  createApiListing,
  getApiListing,
  listApiListings,
  replaceApiEndpoints,
  softDeleteApiListing,
  takenSlugs,
  updateApiListing,
} from "./repository";
import {
  BatchDeleteApiListingsSchema,
  CreateApiListingSchema,
  ListApiListingsQuerySchema,
  ReplaceApiEndpointsSchema,
  UpdateApiListingSchema,
} from "./schema";

const slugTaken = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "slug_taken",
    message: "You already have a listing at that address.",
    issues: [{ path: "slug", message: "is already in use on your profile" }],
  });

const endpointDuplicated = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "endpoint_duplicated",
    message: "Two endpoints share the same method and path.",
    issues: [
      { path: "endpoints", message: "contains the same method and path twice" },
    ],
  });

export const listApiListingsHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(ListApiListingsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
    return invalidBody(reply, [
      { path: "page", message: "is beyond the last page" },
    ]);
  }

  return reply.send(await listApiListings(userId, parsed.data));
};

export const getApiListingHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const listing = await getApiListing(userId, id);

  return listing ? reply.send(listing) : notFound(reply, "listing");
};

export const createApiListingHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateApiListingSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const data = parsed.data;

  let walletId: string | null = null;
  let network: "BASE" | "BASE_SEPOLIA" | "ETHEREUM_SEPOLIA" | null = null;
  let payToAddress: string | null = null;

  if (data.walletId) {
    const resolved = await resolveSellerWallet(userId, data.walletId);
    if (!resolved.ok) {
      return sellerWalletError(reply, resolved);
    }
    walletId = resolved.wallet.id;
    network = resolved.wallet.network;
    payToAddress = resolved.wallet.address;
  }

  const taken = await takenSlugs(userId);
  const requestedSlug = data.slug ?? slugify(data.name);

  if (data.slug && taken.has(data.slug)) {
    return slugTaken(reply);
  }

  const slug = data.slug ?? nextFreeSlug(requestedSlug, taken);

  try {
    const listing = await createApiListing(userId, {
      slug,
      name: data.name,
      summary: data.summary ?? null,
      description: data.description ?? null,
      baseUrl: data.baseUrl ?? null,
      docsUrl: data.docsUrl ?? null,
      category: data.category ?? null,
      tags: data.tags,
      priceLabel: data.priceLabel ?? null,
      visibility: data.visibility,
      publishedAt: data.visibility === "PUBLIC" ? new Date() : null,
      walletId,
      network,
      payToAddress,
      assetAddress: data.assetAddress ?? null,
      priceAmount: data.priceAmount ?? null,
      priceCurrency: data.priceCurrency ?? null,
      x402Endpoint: data.x402Endpoint ?? null,
      endpoints: data.endpoints ?? [],
    });

    appLogger.info("Listing created", {
      userId,
      listingId: listing.id,
      slug: listing.slug,
    });

    return reply.code(201).send(listing);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return slugTaken(reply);
    }
    appLogger.error("Listing create failed", { error, userId });
    throw error;
  }
};

export const updateApiListingHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateApiListingSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getApiListing(userId, id);
  if (!current) {
    return notFound(reply, "listing");
  }

  const next = parsed.data;
  const { walletId, ...rest } = next;
  const data: Record<string, unknown> = { ...rest };

  if (walletId !== undefined) {
    if (walletId === null) {
      data.walletId = null;
      data.network = null;
      data.payToAddress = null;
    } else {
      const resolved = await resolveSellerWallet(userId, walletId);
      if (!resolved.ok) {
        return sellerWalletError(reply, resolved);
      }
      data.walletId = resolved.wallet.id;
      data.network = resolved.wallet.network;
      data.payToAddress = resolved.wallet.address;
    }
  }

  if (next.slug && next.slug !== current.slug) {
    const taken = await takenSlugs(userId);
    if (taken.has(next.slug)) {
      return slugTaken(reply);
    }
  }

  try {
    const updated = await updateApiListing(userId, id, data);
    return updated ? reply.send(updated) : notFound(reply, "listing");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return slugTaken(reply);
    }
    throw error;
  }
};

export const replaceApiEndpointsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(ReplaceApiEndpointsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };

  try {
    const updated = await replaceApiEndpoints(
      userId,
      id,
      parsed.data.endpoints,
    );
    return updated ? reply.send(updated) : notFound(reply, "listing");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return endpointDuplicated(reply);
    }
    throw error;
  }
};

export const publishApiListingHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const current = await getApiListing(userId, id);
  if (!current) {
    return notFound(reply, "listing");
  }

  if (!current.payToAddress || !current.network) {
    return reply.code(409).send({
      error: "listing_not_payable",
      message:
        "Choose a receiving wallet before publishing — without one the integration guide cannot generate code.",
      issues: [{ path: "walletId", message: "is required before publishing" }],
    });
  }

  const updated = await updateApiListing(userId, id, {
    visibility: "PUBLIC",
    publishedAt: current.publishedAt ?? new Date(),
  });

  appLogger.info("Listing published", {
    userId,
    listingId: id,
    slug: current.slug,
  });

  return updated ? reply.send(updated) : notFound(reply, "listing");
};

export const unpublishApiListingHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const updated = await updateApiListing(userId, id, {
    visibility: "PRIVATE",
  });

  if (!updated) {
    return notFound(reply, "listing");
  }

  appLogger.info("Listing unpublished", { userId, listingId: id });
  return reply.send(updated);
};

export const deleteApiListingHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await softDeleteApiListing(userId, id);

  if (deleted) {
    appLogger.info("Listing removed", { userId, listingId: id });
    return reply.code(204).send();
  }

  return notFound(reply, "listing");
};

export const batchDeleteApiListingsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteApiListingsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await batchSoftDeleteApiListings(userId, parsed.data.ids);
  appLogger.info("Listings removed", {
    userId,
    count: result.deleted.length,
  });

  return reply.send(result);
};
