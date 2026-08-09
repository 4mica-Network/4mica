import type { FastifyInstance } from "fastify";

export const guards = (app: FastifyInstance) => ({
  onRequest: [app.authenticate],
  preHandler: [app.getUserData],
});
