import { createClerkClient } from "@clerk/backend";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { extractProfile } from "./claims";
import { toWebRequest } from "./request";
import type { AuthContext, ClerkAuthOptions } from "./types";

const UNAUTHORIZED = {
  error: "unauthorized",
  message: "A valid Clerk session token is required.",
} as const;

const clerkAuthPlugin = async (
  app: FastifyInstance,
  options: ClerkAuthOptions,
): Promise<void> => {
  const { secretKey, publishableKey, jwtKey, authorizedParties, loadUser } =
    options;
  const log = options.logger;

  const clerk = createClerkClient({
    secretKey,
    publishableKey,
    ...(jwtKey ? { jwtKey } : {}),
  });

  app.decorateRequest("auth", null);
  app.decorateRequest("user", null);

  const resolveAuth = async (
    request: FastifyRequest,
  ): Promise<AuthContext | null> => {
    let webRequest: Request;
    try {
      webRequest = toWebRequest(request);
    } catch (error) {
      log?.warn("Could not convert request for Clerk", { err: error });
      return null;
    }

    let state: Awaited<ReturnType<typeof clerk.authenticateRequest>>;
    try {
      state = await clerk.authenticateRequest(webRequest, {
        acceptsToken: "session_token",
        ...(jwtKey ? { jwtKey } : {}),
        ...(authorizedParties?.length ? { authorizedParties } : {}),
      });
    } catch (error) {
      log?.warn("Clerk authentication threw", { err: error });
      return null;
    }

    if (!state.isAuthenticated) {
      log?.warn("Clerk authentication rejected", {
        reason: state.reason,
        status: state.status,
      });
      return null;
    }

    const auth = state.toAuth();
    if (auth.tokenType !== "session_token" || !auth.userId) {
      return null;
    }

    return {
      tokenType: "session_token",
      clerkUserId: auth.userId,
      sessionId: auth.sessionId,
      claims: auth.sessionClaims as Readonly<Record<string, unknown>>,
    };
  };

  const authenticate = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const auth = await resolveAuth(request);

    if (!auth) {
      await reply.code(401).send(UNAUTHORIZED);
      return;
    }

    request.auth = auth;
  };

  const getUserData = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (!request.auth) {
      await authenticate(request, reply);
      if (reply.sent || !request.auth) {
        return;
      }
    }

    const { clerkUserId, sessionId, claims } = request.auth;

    request.user = await loadUser({
      clerkUserId,
      sessionId,
      ...extractProfile(claims),
    });
  };

  app.decorate("authenticate", authenticate);
  app.decorate("getUserData", getUserData);
};

export const clerkAuth = fp(clerkAuthPlugin, {
  name: "@4mica/auth",
  fastify: "5.x",
});
