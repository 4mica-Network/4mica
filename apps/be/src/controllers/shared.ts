import type { FastifyReply, FastifyRequest } from "fastify";
import * as v from "valibot";

/**
 * The only source of the acting user's id is the verified session token, via
 * getUserData. No route accepts an id from the path, query or body, so a
 * caller cannot address anyone else's record.
 */
export const requireUserId = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  if (!request.user) {
    reply.code(401).send({
      error: "unauthorized",
      message: "No user context is attached to this request.",
    });
    return null;
  }

  if (request.user.disabled) {
    reply.code(403).send({
      error: "account_disabled",
      message: "This account cannot be modified.",
    });
    return null;
  }

  return request.user.id;
};

export const notFound = (reply: FastifyReply, what: string) =>
  reply.code(404).send({
    error: "not_found",
    message: `That ${what} does not exist.`,
  });

export interface ValidationIssue {
  path: string;
  message: string;
}

export const invalidBody = (reply: FastifyReply, issues: ValidationIssue[]) =>
  reply.code(400).send({
    error: "invalid_request",
    message: "The request body failed validation.",
    issues,
  });

export const parseBody = <TSchema extends v.GenericSchema>(
  schema: TSchema,
  body: unknown,
):
  | { success: true; data: v.InferOutput<TSchema> }
  | { success: false; issues: ValidationIssue[] } => {
  const result = v.safeParse(schema, body ?? {});

  if (result.success) {
    return { success: true, data: result.output };
  }

  return {
    success: false,
    issues: result.issues.map((issue) => ({
      path: v.getDotPath(issue) ?? "(root)",
      message: issue.message,
    })),
  };
};
