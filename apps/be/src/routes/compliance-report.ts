import {
  complianceReportCsvHandler,
  complianceReportHandler,
} from "@controllers/compliance-report/index";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import { errorResponseSchema, limitedResponses } from "./schema-fragments";

const str = { type: "string" } as const;
const nullStr = { type: ["string", "null"] } as const;
const int = { type: "integer" } as const;
const bool = { type: "boolean" } as const;
const num = { type: ["number", "null"] } as const;
const dateTime = { type: "string", format: "date-time" } as const;
const nullDateTime = { type: ["string", "null"], format: "date-time" } as const;
const strings = { type: "array", items: str } as const;

const projectRef = {
  type: "array",
  items: {
    type: "object",
    properties: { id: str, name: str, slug: str },
  },
} as const;

const coverage = {
  type: "object",
  properties: { unknown: int, percent: num, enrolled: int, covered: int },
} as const;

const reportSchema = {
  type: "object",
  required: ["generatedAt", "checks"],
  properties: {
    generatedAt: dateTime,
    organization: {
      type: ["object", "null"],
      properties: { id: str, name: str, handle: nullStr, personal: bool },
    },
    checks: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "status", "detail"],
        properties: {
          id: str,
          title: str,
          status: { type: "string", enum: ["pass", "warn", "fail"] },
          detail: str,
        },
      },
    },
    identity: {
      type: "object",
      properties: {
        totalMembers: int,
        activeMembers: int,
        suspended: int,
        byRole: {
          type: "object",
          properties: {
            OWNER: int,
            ADMIN: int,
            FINANCE: int,
            DEVELOPER: int,
            VIEWER: int,
          },
        },
        byCustomRole: {
          type: "array",
          items: {
            type: "object",
            properties: { id: str, name: str, members: int },
          },
        },
        mfa: coverage,
        sso: coverage,
      },
    },
    access: {
      type: "object",
      properties: {
        customRoles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: str,
              name: str,
              permissions: strings,
              projectRole: str,
              members: int,
            },
          },
        },
        restrictedProjects: projectRef,
        productionRestrictedProjects: projectRef,
      },
    },
    credentials: {
      type: "object",
      properties: {
        apiKeys: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: str,
              name: str,
              environment: str,
              scopes: strings,
              serviceAccount: {
                type: ["object", "null"],
                properties: { id: str, name: str },
              },
              createdAt: dateTime,
              lastUsedAt: nullDateTime,
              expiresAt: nullDateTime,
              ageDays: int,
              ipRestricted: bool,
            },
          },
        },
        cliSessions: int,
        scimTokens: int,
      },
    },
    financial: {
      type: "object",
      properties: {
        policies: {
          type: "object",
          properties: { total: int, enabled: int, enforced: int, frozen: int },
        },
        governance: {
          type: "object",
          properties: { approvalsRequired: int, governedActions: strings },
        },
        approvalStats30d: {
          type: "object",
          properties: {
            total: int,
            approved: int,
            rejected: int,
            expired: int,
            cancelled: int,
            pending: int,
          },
        },
      },
    },
    logging: {
      type: "object",
      properties: {
        auditRetentionDays: { type: ["integer", "null"] },
        streams: {
          type: "object",
          properties: { total: int, active: int, failing: int, paused: int },
        },
      },
    },
  },
} as const;

const errors = {
  ...limitedResponses,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
} as const;

export const complianceReportRoutes: FastifyPluginCallback = (
  app,
  _opts,
  done,
) => {
  const base = guards(app);

  app.get(
    "/me/organization/compliance-report",
    {
      ...base,
      schema: {
        tags: ["organizations"],
        summary: "Security and compliance posture of the organization",
        security: [{ bearerAuth: [] }],
        response: { ...errors, 200: reportSchema },
      },
    },
    complianceReportHandler,
  );

  app.get(
    "/me/organization/compliance-report.csv",
    {
      ...base,
      schema: {
        tags: ["organizations"],
        summary: "The compliance checks and API key inventory as CSV",
        security: [{ bearerAuth: [] }],
        response: errors,
      },
    },
    complianceReportCsvHandler,
  );

  done();
};
