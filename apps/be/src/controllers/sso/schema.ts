import { JoinRoleSchema } from "@controllers/domains/schema";
import { httpsUrl, singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

export const SSO_PROVIDERS = [
  "OKTA",
  "MICROSOFT_ENTRA",
  "GOOGLE_WORKSPACE",
  "CUSTOM",
] as const;

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120),
  singleLine,
);

const entityId = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(2048),
  singleLine,
);

const certificate = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(64),
  v.maxLength(16_384),
);

const idpFields = {
  idpMetadataUrl: v.optional(httpsUrl(2048)),
  idpEntityId: v.optional(entityId),
  idpSsoUrl: v.optional(httpsUrl(2048)),
  idpCertificate: v.optional(certificate),
};

interface IdpInput {
  idpMetadataUrl?: string | undefined;
  idpEntityId?: string | undefined;
  idpSsoUrl?: string | undefined;
  idpCertificate?: string | undefined;
}

const hasIdp = (input: IdpInput) =>
  input.idpMetadataUrl !== undefined ||
  (input.idpEntityId !== undefined &&
    input.idpSsoUrl !== undefined &&
    input.idpCertificate !== undefined);

export const CreateSsoConnectionSchema = v.pipe(
  v.object({
    domainId: v.pipe(v.string(), v.uuid()),
    provider: v.picklist(SSO_PROVIDERS),
    name,
    ...idpFields,
    defaultRole: v.optional(JoinRoleSchema, "VIEWER"),
    jitProvisioning: v.optional(v.boolean(), true),
  }),
  v.check(
    (input) => hasIdp(input),
    "provide idpMetadataUrl, or idpEntityId, idpSsoUrl and idpCertificate together",
  ),
);

export const UpdateSsoConnectionSchema = v.object({
  name: v.optional(name),
  ...idpFields,
  active: v.optional(v.boolean()),
  enforced: v.optional(v.boolean()),
  jitProvisioning: v.optional(v.boolean()),
  defaultRole: v.optional(JoinRoleSchema),
});

export type CreateSsoConnectionInput = v.InferOutput<
  typeof CreateSsoConnectionSchema
>;
export type UpdateSsoConnectionInput = v.InferOutput<
  typeof UpdateSsoConnectionSchema
>;
