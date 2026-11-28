import {
  getSecuritySettingsHandler,
  updateSecuritySettingsHandler,
} from "@controllers/security/index";
import {
  IP_ALLOWLIST_MAX,
  REAUTH_WINDOW_MINUTES_MAX,
  SESSION_MAX_AGE_HOURS_MAX,
} from "@controllers/security/schema";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import { errorResponseSchema, limitedResponses } from "./schema-fragments";

const str = { type: "string" } as const;

const securitySettingsSchema = {
  type: "object",
  required: [
    "requireMfa",
    "sessionMaxAgeHours",
    "reauthWindowMinutes",
    "ipAllowlist",
    "enforceIpAllowlistForApiKeys",
  ],
  properties: {
    requireMfa: { type: "boolean" },
    sessionMaxAgeHours: {
      type: ["integer", "null"],
      minimum: 1,
      maximum: SESSION_MAX_AGE_HOURS_MAX,
    },
    reauthWindowMinutes: {
      type: "integer",
      minimum: 1,
      maximum: REAUTH_WINDOW_MINUTES_MAX,
    },
    ipAllowlist: {
      type: "array",
      maxItems: IP_ALLOWLIST_MAX,
      items: str,
    },
    enforceIpAllowlistForApiKeys: { type: "boolean" },
  },
} as const;

const errors = {
  ...limitedResponses,
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
} as const;

const doc = (summary: string, description: string) => ({
  tags: ["organizations"],
  summary,
  description,
  security: [{ bearerAuth: [] }],
  response: { ...errors, 200: securitySettingsSchema },
});

export const securityRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  app.get(
    "/me/organization/security",
    {
      ...base,
      schema: doc(
        "The active organization's security policies",
        "Needs `members.manage` or `compliance.read`.",
      ),
    },
    getSecuritySettingsHandler,
  );

  app.put(
    "/me/organization/security",
    {
      onRequest: base.onRequest,
      preHandler: [...base.preHandler, sensitiveRateLimit(app)],
      schema: doc(
        "Change the active organization's security policies",
        "Needs `security.manage` and a recent sign-in (`reauth_required` otherwise). Omitted fields keep their value. `ipAllowlist` takes IPv4/IPv6 addresses and CIDR ranges; a list that would exclude the caller's own address answers 409 `would_lock_out`.",
      ),
    },
    updateSecuritySettingsHandler,
  );

  done();
};
