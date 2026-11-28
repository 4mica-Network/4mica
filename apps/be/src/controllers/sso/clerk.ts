import type { SsoProvider } from "@4mica/db";
import { clerk } from "@services/clerk";
import type { FastifyReply } from "fastify";

type CreateParams = Parameters<
  typeof clerk.samlConnections.createSamlConnection
>[0];
type UpdateParams = NonNullable<
  Parameters<typeof clerk.samlConnections.updateSamlConnection>[1]
>;
export type SamlIdpSlug = CreateParams["provider"];
export type ClerkSamlConnection = Awaited<
  ReturnType<typeof clerk.samlConnections.getSamlConnection>
>;

export const PROVIDER_SLUGS = {
  OKTA: "saml_okta",
  MICROSOFT_ENTRA: "saml_microsoft",
  GOOGLE_WORKSPACE: "saml_google",
  CUSTOM: "saml_custom",
} as const satisfies Record<SsoProvider, SamlIdpSlug>;

interface ClerkErrorEntry {
  code?: string;
  message?: string;
  longMessage?: string;
  meta?: { paramName?: string };
}

interface ClerkErrorShape {
  status?: number;
  errors?: ClerkErrorEntry[];
}

const UNAVAILABLE = /feature|not_enabled|^not_allowed_access$/;

const asClerkError = (error: unknown): ClerkErrorShape | null =>
  typeof error === "object" &&
  error !== null &&
  Array.isArray((error as ClerkErrorShape).errors)
    ? (error as ClerkErrorShape)
    : null;

export type ClerkFailure =
  | { kind: "unavailable"; detail: string | null }
  | { kind: "invalid"; issues: { path: string; message: string }[] }
  | { kind: "not_found" }
  | { kind: "upstream" };

const camel = (name: string) =>
  name.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

export const classifyClerkError = (error: unknown): ClerkFailure => {
  const shape = asClerkError(error);
  if (!shape) {
    return { kind: "upstream" };
  }
  const entries = shape.errors ?? [];
  const status = shape.status ?? 0;

  if (
    status === 402 ||
    entries.some((entry) => UNAVAILABLE.test(entry.code ?? ""))
  ) {
    return {
      kind: "unavailable",
      detail: entries[0]?.longMessage ?? entries[0]?.message ?? null,
    };
  }
  if (status === 404) {
    return { kind: "not_found" };
  }
  if (status >= 400 && status < 500) {
    return {
      kind: "invalid",
      issues: entries.map((entry) => ({
        path: entry.meta?.paramName ? camel(entry.meta.paramName) : "(root)",
        message: entry.longMessage ?? entry.message ?? "is invalid",
      })),
    };
  }
  return { kind: "upstream" };
};

export const sendClerkFailure = (
  reply: FastifyReply,
  failure: ClerkFailure,
) => {
  switch (failure.kind) {
    case "unavailable":
      return reply.code(409).send({
        error: "sso_unavailable",
        message:
          "Enterprise SSO is not enabled for this 4mica deployment, so the connection was not created. Contact 4mica support to enable it.",
      });
    case "invalid":
      return reply.code(400).send({
        error: "invalid_request",
        message: "The identity provider configuration was rejected.",
        issues: failure.issues.length
          ? failure.issues
          : [{ path: "(root)", message: "is invalid" }],
      });
    case "not_found":
      return reply.code(409).send({
        error: "sso_connection_missing",
        message:
          "The SAML connection no longer exists at the identity service. Delete it and create it again.",
      });
    case "upstream":
      return reply.code(502).send({
        error: "identity_service_unavailable",
        message: "The identity service could not be reached. Retry shortly.",
      });
  }
};

export const createSamlConnection = (params: CreateParams) =>
  clerk.samlConnections.createSamlConnection(params);

export const getSamlConnection = (id: string) =>
  clerk.samlConnections.getSamlConnection(id);

export const updateSamlConnection = (id: string, params: UpdateParams) =>
  clerk.samlConnections.updateSamlConnection(id, params);

export const deleteSamlConnection = async (id: string): Promise<void> => {
  try {
    await clerk.samlConnections.deleteSamlConnection(id);
  } catch (error) {
    if (classifyClerkError(error).kind !== "not_found") {
      throw error;
    }
  }
};

export const serviceProviderOf = (connection: ClerkSamlConnection | null) =>
  connection
    ? {
        acsUrl: connection.acsUrl,
        entityId: connection.spEntityId,
        metadataUrl: connection.spMetadataUrl,
      }
    : null;
