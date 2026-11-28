import type { FastifyReply } from "fastify";

export const SCIM_CONTENT_TYPE = "application/scim+json; charset=utf-8";

export const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

export type ScimErrorType =
  | "invalidFilter"
  | "tooMany"
  | "uniqueness"
  | "mutability"
  | "invalidSyntax"
  | "invalidPath"
  | "noTarget"
  | "invalidValue"
  | "invalidVers"
  | "sensitive";

export class ScimError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly scimType?: ScimErrorType,
  ) {
    super(detail);
  }
}

export const sendScimError = (
  reply: FastifyReply,
  status: number,
  detail: string,
  scimType?: ScimErrorType,
) =>
  reply
    .code(status)
    .type(SCIM_CONTENT_TYPE)
    .send({
      schemas: [ERROR_SCHEMA],
      status: String(status),
      ...(scimType ? { scimType } : {}),
      detail,
    });

export const invalidValue = (detail: string) =>
  new ScimError(400, detail, "invalidValue");

export const notFoundError = (what: "User" | "Group", id: string) =>
  new ScimError(404, `${what} ${id} not found.`);
