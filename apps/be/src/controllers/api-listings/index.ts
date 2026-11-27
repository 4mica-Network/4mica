import type { PaymentNetwork } from "@4mica/db";
import { slugify } from "@4mica/rules";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  auditProject,
  invalidBody,
  notFound,
  parseBody,
  requireProject,
  sellerWalletError,
} from "@controllers/shared";
import { resolveSellerWallet } from "@controllers/wallets/repository";
import { appLogger } from "@logger/index";
import { resolvePriceAsset } from "@utils/price-asset";
import { isUniqueViolation } from "@utils/prisma-errors";
import { networkAllowed, networkIssue } from "@utils/scope";
import { nextFreeSlug } from "@utils/slug";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  batchSoftDeleteApiListings,
  createApiListing,
  getApiListing,
  listApiListings,
  softDeleteApiListing,
  takenSlugs,
  updateApiListing,
} from "./repository";
import {
  BatchDeleteApiListingsSchema,
  CreateApiListingSchema,
  ListApiListingsQuerySchema,
  UpdateApiListingSchema,
} from "./schema";

const slugTaken = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "slug_taken",
    message: "You already have a listing at that address.",
    issues: [{ path: "slug", message: "is already in use on your profile" }],
  });

const notPayable = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "listing_not_payable",
    message:
      "Choose a receiving wallet before publishing — without one the integration guide cannot generate code.",
    issues: [{ path: "walletId", message: "is required before publishing" }],
  });

export const listApiListingsHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
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

  return reply.send(await listApiListings(scope, parsed.data));
};

export const getApiListingHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const listing = await getApiListing(scope, id);

  return listing ? reply.send(listing) : notFound(reply, "listing");
};

export const createApiListingHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
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
    const resolved = await resolveSellerWallet(scope.orgId, data.walletId);
    if (!resolved.ok) {
      return sellerWalletError(reply, resolved);
    }
    if (!networkAllowed(scope, resolved.wallet.network)) {
      return invalidBody(reply, [networkIssue(scope)]);
    }
    walletId = resolved.wallet.id;
    network = resolved.wallet.network;
    payToAddress = resolved.wallet.address;
  }

  const priced = resolvePriceAsset(network, data.assetAddress ?? null);
  if (!priced.ok) {
    return invalidBody(reply, [priced.issue]);
  }

  if (data.visibility === "PUBLIC" && !payToAddress) {
    return notPayable(reply);
  }

  const taken = await takenSlugs(scope.orgId);
  const requestedSlug = data.slug ?? slugify(data.name);

  if (data.slug && taken.has(data.slug)) {
    return slugTaken(reply);
  }

  const slug = data.slug ?? nextFreeSlug(requestedSlug, taken);

  try {
    const listing = await createApiListing(scope, scope.userId, {
      slug,
      name: data.name,
      summary: data.summary ?? null,
      description: data.description ?? null,
      url: data.url ?? null,
      method: data.method,
      docsUrl: data.docsUrl ?? null,
      category: data.category ?? null,
      tags: data.tags,
      priceLabel: data.priceLabel ?? null,
      visibility: data.visibility,
      publishedAt: data.visibility === "PUBLIC" ? new Date() : null,
      walletId,
      network,
      payToAddress,
      assetAddress: priced.assetAddress,
      priceAmount: data.priceAmount ?? null,
      priceCurrency: priced.priceCurrency,
      x402Endpoint: data.x402Endpoint ?? null,
    });

    await auditProject(request, scope, {
      action: "api_listing.created",
      targetType: "api_listing",
      targetId: listing.id,
    });

    appLogger.info("Listing created", {
      userId: scope.userId,
      listingId: listing.id,
      slug: listing.slug,
    });

    return reply.code(201).send(listing);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return slugTaken(reply);
    }
    appLogger.error("Listing create failed", { error, userId: scope.userId });
    throw error;
  }
};

export const updateApiListingHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateApiListingSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getApiListing(scope, id);
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
      const resolved = await resolveSellerWallet(scope.orgId, walletId);
      if (!resolved.ok) {
        return sellerWalletError(reply, resolved);
      }
      if (!networkAllowed(scope, resolved.wallet.network)) {
        return invalidBody(reply, [networkIssue(scope)]);
      }
      data.walletId = resolved.wallet.id;
      data.network = resolved.wallet.network;
      data.payToAddress = resolved.wallet.address;
    }
  }

  if (walletId !== undefined || next.assetAddress !== undefined) {
    const priced = resolvePriceAsset(
      ("network" in data
        ? data.network
        : current.network) as PaymentNetwork | null,
      next.assetAddress !== undefined
        ? next.assetAddress
        : current.assetAddress,
    );
    if (!priced.ok) {
      return invalidBody(reply, [priced.issue]);
    }
    data.assetAddress = priced.assetAddress;
    data.priceCurrency = priced.priceCurrency;
  }

  const payToAfter =
    "payToAddress" in data
      ? (data.payToAddress as string | null)
      : current.payToAddress;

  if (next.visibility === "PUBLIC") {
    if (!payToAfter) {
      return notPayable(reply);
    }
    if (walletId === undefined && current.walletId) {
      const resolved = await resolveSellerWallet(scope.orgId, current.walletId);
      if (!resolved.ok) {
        return sellerWalletError(reply, resolved);
      }
    }
    data.publishedAt = current.publishedAt ?? new Date();
  } else if (
    next.visibility === undefined &&
    current.visibility === "PUBLIC" &&
    !payToAfter
  ) {
    data.visibility = "PRIVATE";
  }

  if (next.slug && next.slug !== current.slug) {
    const taken = await takenSlugs(scope.orgId);
    if (taken.has(next.slug)) {
      return slugTaken(reply);
    }
  }

  try {
    const updated = await updateApiListing(scope, id, data);
    if (!updated) {
      return notFound(reply, "listing");
    }
    await auditProject(request, scope, {
      action: "api_listing.updated",
      targetType: "api_listing",
      targetId: id,
    });
    return reply.send(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return slugTaken(reply);
    }
    throw error;
  }
};

export const publishApiListingHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const current = await getApiListing(scope, id);
  if (!current) {
    return notFound(reply, "listing");
  }

  if (!current.payToAddress || !current.network) {
    return notPayable(reply);
  }

  if (current.walletId) {
    const resolved = await resolveSellerWallet(scope.orgId, current.walletId);
    if (!resolved.ok) {
      return sellerWalletError(reply, resolved);
    }
  }

  const updated = await updateApiListing(scope, id, {
    visibility: "PUBLIC",
    publishedAt: current.publishedAt ?? new Date(),
  });

  if (updated) {
    await auditProject(request, scope, {
      action: "api_listing.published",
      targetType: "api_listing",
      targetId: id,
    });
  }

  appLogger.info("Listing published", {
    userId: scope.userId,
    listingId: id,
    slug: current.slug,
  });

  return updated ? reply.send(updated) : notFound(reply, "listing");
};

export const unpublishApiListingHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const updated = await updateApiListing(scope, id, {
    visibility: "PRIVATE",
  });

  if (!updated) {
    return notFound(reply, "listing");
  }

  await auditProject(request, scope, {
    action: "api_listing.unpublished",
    targetType: "api_listing",
    targetId: id,
  });
  appLogger.info("Listing unpublished", {
    userId: scope.userId,
    listingId: id,
  });
  return reply.send(updated);
};

export const deleteApiListingHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await softDeleteApiListing(scope, id);

  if (deleted) {
    await auditProject(request, scope, {
      action: "api_listing.deleted",
      targetType: "api_listing",
      targetId: id,
    });
    appLogger.info("Listing removed", { userId: scope.userId, listingId: id });
    return reply.code(204).send();
  }

  return notFound(reply, "listing");
};

export const batchDeleteApiListingsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteApiListingsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await batchSoftDeleteApiListings(scope, parsed.data.ids);
  if (result.deleted.length > 0) {
    await auditProject(request, scope, {
      action: "api_listing.deleted",
      targetType: "api_listing",
      metadata: { ids: result.deleted },
    });
  }
  appLogger.info("Listings removed", {
    userId: scope.userId,
    count: result.deleted.length,
  });

  return reply.send(result);
};
