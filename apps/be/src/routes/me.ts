import type { FastifyPluginCallback } from "fastify";

const meResponseSchema = {
  type: "object",
  required: ["id", "clerkUserId"],
  properties: {
    id: { type: "string" },
    clerkUserId: { type: "string" },
    email: { type: "string", nullable: true },
    name: { type: "string", nullable: true },
    avatarUrl: { type: "string", nullable: true },
  },
} as const;

const errorResponseSchema = {
  type: "object",
  required: ["error", "message"],
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

export const meRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    "/me",
    {
      onRequest: [app.authenticate],
      preHandler: [app.getUserData],
      schema: {
        tags: ["account"],
        summary: "The currently authenticated user",
        security: [{ bearerAuth: [] }],
        response: {
          200: meResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "No user context is attached to this request.",
        });
      }

      return reply.send(request.user);
    },
  );

  done();
};
