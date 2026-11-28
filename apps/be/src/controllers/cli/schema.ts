import { CLI_SCOPES } from "@auth/cli-token";
import { singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

export const TOKEN_LIFETIME_DAYS = [30, 90, 365] as const;

export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120),
  singleLine,
);

const organizationId = v.optional(v.pipe(v.string(), v.trim(), v.uuid()));

export const CreateDeviceCodeSchema = v.object({
  client_name: v.optional(name, "4mica CLI"),
  scope: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  organization: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  ),
});

export const DeviceTokenSchema = v.object({
  grant_type: v.string(),
  device_code: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});

const userCode = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32));

export const UserCodeSchema = v.object({ userCode });

export const ApproveDeviceSchema = v.object({ userCode, organizationId });

export const CreateCliTokenSchema = v.object({
  name,
  scopes: v.optional(
    v.pipe(
      v.array(v.picklist(CLI_SCOPES)),
      v.minLength(1, "choose at least one permission"),
    ),
  ),
  expiresInDays: v.optional(v.picklist(TOKEN_LIFETIME_DAYS), 90),
  organizationId,
});

export type CreateDeviceCodeInput = v.InferOutput<
  typeof CreateDeviceCodeSchema
>;
export type CreateCliTokenInput = v.InferOutput<typeof CreateCliTokenSchema>;
