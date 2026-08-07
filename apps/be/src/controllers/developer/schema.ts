import * as v from "valibot";
import { isKnownEvent } from "../../services/webhook-events";

const name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));

const eventList = v.pipe(
  v.array(
    v.pipe(
      v.string(),
      v.check(isKnownEvent, "is not a supported webhook event"),
    ),
  ),
  v.minLength(1, "select at least one event"),
  v.transform((events) => [...new Set(events)]),
);

/** Only https endpoints, so a signing secret is never sent in the clear. */
const webhookUrl = v.pipe(
  v.string(),
  v.trim(),
  v.url("must be a valid URL"),
  v.startsWith("https://", "must be an https URL"),
  v.maxLength(2048),
);

export const CreateApiKeySchema = v.object({
  name,
  expiresAt: v.optional(
    v.nullable(v.pipe(v.string(), v.isoTimestamp("must be an ISO timestamp"))),
  ),
});

export const UpdateApiKeySchema = v.object({
  name,
});

export const CreateWebhookSchema = v.object({
  url: webhookUrl,
  description: v.optional(
    v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(255))),
  ),
  events: eventList,
});

export const UpdateWebhookSchema = v.partial(
  v.object({
    url: webhookUrl,
    description: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(255))),
    events: eventList,
    status: v.picklist(["ENABLED", "DISABLED"]),
  }),
);

export type CreateApiKeyInput = v.InferOutput<typeof CreateApiKeySchema>;
export type UpdateApiKeyInput = v.InferOutput<typeof UpdateApiKeySchema>;
export type CreateWebhookInput = v.InferOutput<typeof CreateWebhookSchema>;
export type UpdateWebhookInput = v.InferOutput<typeof UpdateWebhookSchema>;
