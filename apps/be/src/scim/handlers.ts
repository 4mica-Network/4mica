import { appLogger } from "@logger/index";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import { SCIM_CONTENT_TYPE, ScimError, sendScimError } from "./errors";
import {
  createGroup,
  createUser,
  deleteGroup,
  deleteUser,
  getGroup,
  getUser,
  listGroups,
  listUsers,
  patchGroup,
  patchUser,
  replaceGroup,
  replaceUser,
  type ScimActor,
} from "./provisioning";
import {
  findResourceType,
  findSchemaDocument,
  listResponse,
  resourceTypes,
  schemaDocuments,
  serviceProviderConfig,
} from "./resources";
import { parseGroup, parseUser } from "./schema";

const actorOf = (request: FastifyRequest): ScimActor | null =>
  request.scim
    ? {
        tokenId: request.scim.tokenId,
        orgId: request.scim.orgId,
        ip: request.ip,
      }
    : null;

const idOf = (request: FastifyRequest) => (request.params as { id: string }).id;

const queryOf = (request: FastifyRequest) =>
  (request.query ?? {}) as Record<string, unknown>;

const scim =
  (
    run: (
      actor: ScimActor,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>,
    status = 200,
  ): RouteHandler =>
  async (request, reply) => {
    const actor = actorOf(request);
    if (!actor) {
      return sendScimError(reply, 401, "A valid SCIM token is required.");
    }
    try {
      const body = await run(actor, request, reply);
      if (status === 204) {
        return reply.code(204).send();
      }
      const location =
        status === 201 && body && typeof body === "object"
          ? (body as { meta?: { location?: string } }).meta?.location
          : undefined;
      if (location) {
        reply.header("location", location);
      }
      return reply.code(status).type(SCIM_CONTENT_TYPE).send(body);
    } catch (error) {
      if (error instanceof ScimError) {
        return sendScimError(reply, error.status, error.detail, error.scimType);
      }
      appLogger.error("SCIM request failed", {
        orgId: actor.orgId,
        method: request.method,
        route: request.routeOptions.url ?? null,
        error,
      });
      return sendScimError(reply, 500, "The request could not be completed.");
    }
  };

export const serviceProviderConfigHandler = scim(async () =>
  serviceProviderConfig(),
);

export const listResourceTypesHandler = scim(async () => {
  const types = resourceTypes();
  return listResponse(types, types.length, 1);
});

export const getResourceTypeHandler = scim(async (_actor, request) => {
  const type = findResourceType(idOf(request));
  if (!type) {
    throw new ScimError(404, `Resource type ${idOf(request)} not found.`);
  }
  return type;
});

export const listSchemasHandler = scim(async () => {
  const schemas = schemaDocuments();
  return listResponse(schemas, schemas.length, 1);
});

export const getSchemaHandler = scim(async (_actor, request) => {
  const schema = findSchemaDocument(idOf(request));
  if (!schema) {
    throw new ScimError(404, `Schema ${idOf(request)} not found.`);
  }
  return schema;
});

export const listUsersHandler = scim((actor, request) =>
  listUsers(actor.orgId, queryOf(request)),
);

export const getUserHandler = scim((actor, request) =>
  getUser(actor.orgId, idOf(request)),
);

export const createUserHandler = scim(
  (actor, request) => createUser(actor, parseUser(request.body)),
  201,
);

export const replaceUserHandler = scim((actor, request) =>
  replaceUser(actor, idOf(request), parseUser(request.body)),
);

export const patchUserHandler = scim((actor, request) =>
  patchUser(actor, idOf(request), request.body),
);

export const deleteUserHandler = scim(
  (actor, request) => deleteUser(actor, idOf(request)),
  204,
);

export const listGroupsHandler = scim((actor, request) =>
  listGroups(actor.orgId, queryOf(request)),
);

export const getGroupHandler = scim((actor, request) =>
  getGroup(actor.orgId, idOf(request), queryOf(request)),
);

export const createGroupHandler = scim(
  (actor, request) => createGroup(actor, parseGroup(request.body)),
  201,
);

export const replaceGroupHandler = scim((actor, request) =>
  replaceGroup(actor, idOf(request), parseGroup(request.body)),
);

export const patchGroupHandler = scim((actor, request) =>
  patchGroup(actor, idOf(request), request.body),
);

export const deleteGroupHandler = scim(
  (actor, request) => deleteGroup(actor, idOf(request)),
  204,
);
