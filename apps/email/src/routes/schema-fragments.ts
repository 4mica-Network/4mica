export const errorResponseSchema = {
  type: "object",
  required: ["error", "message"],
  properties: {
    error: { type: "string", description: "Stable snake_case error code" },
    message: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["path", "message"],
        properties: {
          path: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
} as const;

export const sendAcceptedSchema = {
  type: "object",
  required: ["id", "templateId"],
  properties: {
    id: {
      type: "string",
      description:
        "Resend message id, or a dry-run placeholder when EMAIL_DRY_RUN is enabled",
    },
    templateId: { type: "string" },
    dryRun: { type: "boolean" },
  },
} as const;

export const healthResponseSchema = {
  type: "object",
  required: ["status", "state", "uptime", "timestamp", "templates"],
  properties: {
    status: { type: "string", enum: ["ok", "draining"] },
    state: {
      type: "string",
      enum: ["ready", "draining", "closing"],
      description: "Whether the instance is still accepting traffic",
    },
    uptime: { type: "number", description: "Process uptime in seconds" },
    timestamp: { type: "string", format: "date-time" },
    templates: {
      type: "integer",
      description: "Number of templates registered on this instance",
    },
    dryRun: { type: "boolean" },
  },
} as const;

/** Responses every rate-limited route can produce. */
export const limitedResponses = {
  429: errorResponseSchema,
  503: errorResponseSchema,
} as const;
