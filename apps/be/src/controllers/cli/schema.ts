import { singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120),
  singleLine,
);

export const CreateDeviceCodeSchema = v.object({
  client_name: v.optional(name, "4mica CLI"),
});

export const DeviceTokenSchema = v.object({
  grant_type: v.string(),
  device_code: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});

export const UserCodeSchema = v.object({
  userCode: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32)),
});

export const CreateCliTokenSchema = v.object({ name });

export type CreateDeviceCodeInput = v.InferOutput<
  typeof CreateDeviceCodeSchema
>;
export type CreateCliTokenInput = v.InferOutput<typeof CreateCliTokenSchema>;
