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

/**
 * For the few routes the CLI may call as well as the dashboard. A bearer that
 * is a CLI token is checked as one, against `scope`; anything else takes the
 * Clerk path exactly as `guards` does. Routes that do not opt in here never
 * look a CLI token up at all.
 */
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
