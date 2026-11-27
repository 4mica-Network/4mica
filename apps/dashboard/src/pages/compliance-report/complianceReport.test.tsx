import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import securityActionTypes from "@stores/security/actionTypes";
import { INITIAL_STATE as SECURITY_INITIAL_STATE } from "@stores/security/reducer";
import type { ComplianceReport } from "@stores/security/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";

const { downloadComplianceCsv, downloadComplianceJson } = vi.hoisted(() => ({
  downloadComplianceCsv: vi.fn(async () => undefined),
  downloadComplianceJson: vi.fn(async () => undefined),
}));
vi.mock("@api/security", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@api/security")>()),
  downloadComplianceCsv,
  downloadComplianceJson,
}));

const { ComplianceReportSettings, countChecks, formatValue, humanize } =
  await import("./index");

const REPORT: ComplianceReport = {
  generatedAt: "2026-11-27T10:00:00.000Z",
  organization: { id: "acme", name: "Acme" },
  checks: [
    { id: "mfa", title: "MFA required", status: "pass", detail: "On" },
    { id: "sso", title: "SSO enforced", status: "warn", detail: "Not yet" },
    { id: "keys", title: "Old API keys", status: "fail", detail: "2 keys" },
  ],
  identity: { mfaCoveragePercent: 80, suspended: 1 },
  access: { customRoles: 2 },
  credentials: {
    apiKeys: [
      {
        id: "key_1",
        name: "Prod",
        environment: "PRODUCTION",
        scopes: ["PAYMENTS_WRITE"],
        serviceAccount: { id: "sa_1", name: "Billing bot" },
        createdAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
        expiresAt: null,
        ageDays: 330,
        ipRestricted: true,
      },
    ],
    cliSessions: 3,
  },
  financial: { policies: 4 },
  logging: { auditRetentionDays: 365, streams: 1 },
};

let dispatched: { type: string }[] = [];

const renderReport = (permissions: Permission[]) => {
  dispatched = [];
  const organization: OrganizationSummary = {
    id: "acme",
    handle: "acme",
    name: "Acme",
    avatarUrl: null,
    personal: false,
    role: "ADMIN",
    permissions,
    memberCount: 3,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "me", name: "Ada" } as User },
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [organization],
      activeId: organization.id,
      status: "loaded" as const,
    },
    security: {
      ...SECURITY_INITIAL_STATE,
      report: REPORT,
      reportStatus: "loaded" as const,
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ComplianceReportSettings />
      </MemoryRouter>
    </Provider>,
  );
};

describe("compliance report", () => {
  it("shows each check, the sections and the API key inventory", () => {
    renderReport(["compliance.read"]);

    expect(dispatched.map((action) => action.type)).toContain(
      securityActionTypes.FETCH_REPORT_REQUESTED,
    );
    expect(screen.getByTestId("check-keys")).toHaveTextContent("Fail");
    expect(screen.getByTestId("report-identity")).toHaveTextContent(
      "Mfa Coverage Percent",
    );
    expect(screen.getByTestId("report-key-key_1")).toHaveTextContent(
      "Billing bot",
    );
    expect(screen.getByTestId("report-key-key_1")).toHaveTextContent(
      "Restricted",
    );
  });

  it("downloads the JSON and CSV through the authenticated client", async () => {
    renderReport(["compliance.read"]);

    fireEvent.click(screen.getByTestId("report-download-json"));
    fireEvent.click(screen.getByTestId("report-download-csv"));
    await waitFor(() => {
      expect(downloadComplianceJson).toHaveBeenCalledTimes(1);
      expect(downloadComplianceCsv).toHaveBeenCalledTimes(1);
    });
  });

  it("needs compliance.read", () => {
    renderReport(["members.manage"]);
    expect(
      screen.getByTestId("report-unavailable-empty-state"),
    ).toBeInTheDocument();
  });

  it("formats report values for reading", () => {
    expect(countChecks(REPORT)).toEqual({ pass: 1, warn: 1, fail: 1 });
    expect(humanize("productionRestrictedProjects")).toBe(
      "Production Restricted Projects",
    );
    expect(formatValue({ OWNER: 1, ADMIN: 2 })).toBe("OWNER: 1 · ADMIN: 2");
    expect(formatValue(null)).toBe("—");
    expect(formatValue(["a", "b"])).toBe("a, b");
  });
});
