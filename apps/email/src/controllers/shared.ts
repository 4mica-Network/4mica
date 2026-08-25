import type { FastifyReply } from "fastify";
import * as v from "valibot";

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
