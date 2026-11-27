import {
  authenticateCliToken,
  type CliScope,
  hasCliToken,
} from "@auth/cli-token";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const guards = (app: FastifyInstance) => ({
  onRequest: [app.authenticate],
  preHandler: [app.getUserData],
});

export const cliGuards = (app: FastifyInstance, scope: CliScope) => {
  const asCli = authenticateCliToken(scope);

  return {
    onRequest: [
      (request: FastifyRequest, reply: FastifyReply) =>
        hasCliToken(request)
          ? asCli(request, reply)
          : app.authenticate(request, reply),
    ],
    preHandler: [
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.cliSession) {
          await app.getUserData(request, reply);
        }
      },
    ],
  };
};
