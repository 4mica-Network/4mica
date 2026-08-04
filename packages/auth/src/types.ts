import type { FastifyReply, FastifyRequest } from "fastify";

export interface AuthIdentity {
  clerkUserId: string;
  sessionId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface AuthUser {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface SessionAuthContext {
  tokenType: "session_token";
  clerkUserId: string;
  sessionId: string;
  claims: Readonly<Record<string, unknown>>;
}

export type AuthContext = SessionAuthContext;

export type LoadUser = (identity: AuthIdentity) => Promise<AuthUser>;

export interface AuthPluginLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

export interface ClerkAuthOptions {
  secretKey: string;
  publishableKey: string;
  jwtKey?: string;
  authorizedParties?: string[];
  loadUser: LoadUser;
  logger?: AuthPluginLogger;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    getUserData: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }

  interface FastifyRequest {
    auth: AuthContext | null;
    user: AuthUser | null;
  }
}
