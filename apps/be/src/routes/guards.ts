import type { FastifyInstance } from "fastify";

/** Session verification then user hydration, in that order, on every route. */
export const guards = (app: FastifyInstance) => ({
  onRequest: [app.authenticate],
  preHandler: [app.getUserData],
});
