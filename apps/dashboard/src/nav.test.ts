import type { Permission } from "@stores/organization/type";
import { describe, expect, it } from "vitest";
import type { WorkspaceMode } from "@/hooks/useWorkspaceMode";
import {
  isPathVisible,
  NAV_SECTIONS,
  type NavSection,
  resolveNav,
  SETTINGS_SECTIONS,
} from "./nav";

const PERSONAL: WorkspaceMode = {
  personal: true,
  projectCount: 1,
  canManageOrg: true,
  canSeeProjects: false,
  hasTeamOrganizations: false,
};

const OWNER: WorkspaceMode = {
  personal: false,
  projectCount: 1,
  canManageOrg: true,
  canSeeProjects: true,
  hasTeamOrganizations: true,
};

const DEVELOPER: WorkspaceMode = {
  ...OWNER,
  canManageOrg: false,
  canSeeProjects: false,
};

const everything = () => true;

const labels = (sections: NavSection[]) =>
  sections.flatMap((section) => section.items.map((item) => item.labelKey));

describe("navigation in a personal workspace", () => {
  it("shows one Spending limits entry for finance", () => {
    const finance = resolveNav(NAV_SECTIONS, PERSONAL, everything).find(
      (section) => section.titleKey === "nav.section.finance",
    );

    expect(finance?.items.map((item) => item.labelKey)).toEqual([
      "nav.spendingLimits",
    ]);
    expect(finance?.items[0]?.to).toBe("/finance/policies");
  });

  it("keeps only the personal settings", () => {
    expect(labels(resolveNav(SETTINGS_SECTIONS, PERSONAL, everything))).toEqual(
      [
        "nav.profile",
        "nav.account",
        "nav.business",
        "nav.notifications",
        "nav.plans",
        "nav.compliance",
        "nav.developer",
      ],
    );
  });

  it.each([
    "/finance/approvals",
    "/finance/alerts",
    "/finance/reports",
    "/finance/authorizations",
    "/settings/team",
    "/settings/projects",
    "/settings/roles",
    "/settings/governance",
    "/settings/security",
    "/settings/sso",
    "/settings/scim",
    "/settings/audit-streams",
    "/settings/compliance-report",
    "/settings/audit-log",
    "/settings/service-accounts",
  ])("hides %s", (path) => {
    expect(isPathVisible(path, PERSONAL)).toBe(false);
  });

  it.each([
    "/",
    "/finance/policies",
    "/settings/general",
    "/settings/developer",
    "/agents/agt_1",
  ])("keeps %s", (path) => {
    expect(isPathVisible(path, PERSONAL)).toBe(true);
  });
});

describe("navigation in an organization", () => {
  it("shows the full finance section", () => {
    const finance = resolveNav(NAV_SECTIONS, OWNER, everything).find(
      (section) => section.titleKey === "nav.section.finance",
    );

    expect(finance?.items.map((item) => item.labelKey)).toEqual([
      "nav.policies",
      "nav.approvals",
      "nav.alerts",
      "nav.reports",
      "nav.authorizations",
    ]);
  });

  it("groups settings into organization, workspace and one security entry", () => {
    const sections = resolveNav(SETTINGS_SECTIONS, OWNER, everything);

    expect(sections.map((section) => section.titleKey)).toEqual([
      "nav.section.organization",
      "nav.section.workspace",
      undefined,
    ]);
    expect(sections[0]?.items.map((item) => item.labelKey)).toEqual([
      "nav.account",
      "nav.team",
      "nav.projects",
    ]);
    expect(sections[1]?.items.map((item) => item.labelKey)).toContain(
      "nav.serviceAccounts",
    );
    expect(sections[2]?.items.map((item) => item.labelKey)).toEqual([
      "nav.securityCompliance",
    ]);
    expect(
      sections[2]?.items[0]?.children?.map((item) => item.labelKey),
    ).toEqual([
      "nav.securityPolicies",
      "nav.domainsSso",
      "nav.roles",
      "nav.scim",
      "nav.auditLog",
      "nav.auditStreams",
      "nav.complianceReport",
      "nav.governance",
    ]);
  });

  it("keeps each security tab behind its permission and links to the first allowed", () => {
    const allowed = new Set<Permission>(["audit.read"]);
    const security = resolveNav(SETTINGS_SECTIONS, OWNER, (permission) =>
      allowed.has(permission),
    )
      .flatMap((section) => section.items)
      .find((item) => item.labelKey === "nav.securityCompliance");

    expect(security?.to).toBe("/settings/audit-log");
    expect(security?.children?.map((item) => item.to)).toEqual([
      "/settings/audit-log",
      "/settings/audit-streams",
    ]);
  });

  it("drops the security entry when no tab is allowed", () => {
    const items = resolveNav(SETTINGS_SECTIONS, OWNER, () => false).flatMap(
      (section) => section.items,
    );

    expect(items.map((item) => item.labelKey)).not.toContain(
      "nav.securityCompliance",
    );
  });

  it("hides security and projects from a developer", () => {
    const keys = labels(resolveNav(SETTINGS_SECTIONS, DEVELOPER, everything));

    expect(keys).not.toContain("nav.securityCompliance");
    expect(keys).not.toContain("nav.projects");
    expect(keys).toContain("nav.team");
    expect(isPathVisible("/settings/audit-log", DEVELOPER)).toBe(false);
    expect(isPathVisible("/settings/team", DEVELOPER)).toBe(true);
  });
});
