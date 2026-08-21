import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import type { RouteHandler } from "fastify";
import { listActiveBanners, recordInteraction } from "./repository";
import { RecordBannerInteractionSchema } from "./schema";

export const listBannersHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const banners = await listActiveBanners(userId);

  return reply.send(banners);
};

export const recordBannerInteractionHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(RecordBannerInteractionSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const interaction = await recordInteraction(userId, id, parsed.data);

  if (!interaction) {
    return notFound(reply, "banner");
  }

  return reply.code(204).send();
};
