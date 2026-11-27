import type {
  FastifyError,
  FastifyPluginCallback,
  RouteHandler,
} from "fastify";
import { authenticateScimToken } from "@/scim/auth";
import { sendScimError } from "@/scim/errors";
import {
  createGroupHandler,
  createUserHandler,
  deleteGroupHandler,
  deleteUserHandler,
  getGroupHandler,
  getResourceTypeHandler,
  getSchemaHandler,
  getUserHandler,
  listGroupsHandler,
  listResourceTypesHandler,
  listSchemasHandler,
  listUsersHandler,
  patchGroupHandler,
  patchUserHandler,
  replaceGroupHandler,
  replaceUserHandler,
  serviceProviderConfigHandler,
} from "@/scim/handlers";

export const SCIM_PREFIX = "/scim/v2";

const tags = ["scim"];
const security = [{ scimTokenAuth: [] }];

export const scimRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.addContentTypeParser(
    ["application/scim+json"],
    { parseAs: "string" },
    app.getDefaultJsonParser("error", "error"),
  );

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status =
      typeof error.statusCode === "number" && error.statusCode >= 400
        ? error.statusCode
        : 500;
    return sendScimError(
      reply,
      status,
      status >= 500 ? "The request could not be completed." : error.message,
      status === 400 ? "invalidSyntax" : undefined,
    );
  });

  app.addHook("onRequest", authenticateScimToken);

  const route = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    summary: string,
    handler: RouteHandler,
  ) => app.route({ method, url, schema: { tags, summary, security }, handler });

  route(
    "GET",
    "/ServiceProviderConfig",
    "SCIM service provider configuration",
    serviceProviderConfigHandler,
  );
  route(
    "GET",
    "/ResourceTypes",
    "SCIM resource types",
    listResourceTypesHandler,
  );
  route(
    "GET",
    "/ResourceTypes/:id",
    "A SCIM resource type",
    getResourceTypeHandler,
  );
  route("GET", "/Schemas", "SCIM schemas", listSchemasHandler);
  route("GET", "/Schemas/:id", "A SCIM schema", getSchemaHandler);

  route(
    "GET",
    "/Users",
    "Members provisioned in this organization",
    listUsersHandler,
  );
  route("POST", "/Users", "Provision a member", createUserHandler);
  route("GET", "/Users/:id", "A provisioned member", getUserHandler);
  route(
    "PUT",
    "/Users/:id",
    "Replace a provisioned member",
    replaceUserHandler,
  );
  route("PATCH", "/Users/:id", "Update a provisioned member", patchUserHandler);
  route("DELETE", "/Users/:id", "Deprovision a member", deleteUserHandler);

  route("GET", "/Groups", "Role-mapped groups", listGroupsHandler);
  route("POST", "/Groups", "Create a group", createGroupHandler);
  route("GET", "/Groups/:id", "A group", getGroupHandler);
  route("PUT", "/Groups/:id", "Replace a group", replaceGroupHandler);
  route(
    "PATCH",
    "/Groups/:id",
    "Update a group or its members",
    patchGroupHandler,
  );
  route("DELETE", "/Groups/:id", "Delete a group", deleteGroupHandler);

  done();
};
