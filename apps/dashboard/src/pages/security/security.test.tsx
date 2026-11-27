import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import securityActionTypes from "@stores/security/actionTypes";
import { INITIAL_STATE as SECURITY_INITIAL_STATE } from "@stores/security/reducer";
import type { SecurityFailure, SecurityState } from "@stores/security/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { isValidDomain } from "./DomainsSection";
import { SecuritySettingsPage } from "./index";
import {
  emptySsoDraft,
  toSsoInput,
  validateSsoDraft,
} from "./SsoConnectionModal";

const OWNER: Permission[] = [
  "members.manage",
  "security.manage",
  "roles.manage",
  "compliance.read",
];

const SETTINGS = {
  requireMfa: false,
  sessionMaxAgeHours: null,
  reauthWindowMinutes: 15,
  ipAllowlist: [],
  enforceIpAllowlistForApiKeys: false,
};

const domain = (over: Record<string, unknown>) => ({
  id: "dom_1",
  domain: "acme.com",
  verified: false,
  verifiedAt: null,
  verificationRecord: {
    type: "TXT" as const,
    name: "_4mica-verification.acme.com",
    value: "4mica-verification=tok",
  },
  autoJoin: false,
  autoJoinRole: "VIEWER" as const,
  lastCheckedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const CONNECTION = {
  id: "sso_1",
  domainId: "dom_2",
  domain: "corp.com",
  provider: "OKTA" as const,
  name: "Okta",
  active: true,
  enforced: false,
  jitProvisioning: true,
  defaultRole: "VIEWER" as const,
  idpEntityId: null,
  idpSsoUrl: null,
  idpMetadataUrl: "https://corp.okta.com/metadata",
  serviceProvider: {
    acsUrl: "https://clerk.example/acs",
    entityId: "https://clerk.example/entity",
    metadataUrl: "https://clerk.example/metadata",
  },
  createdAt: "2026-11-01T00:00:00.000Z",
};

let dispatched: { type: string; payload?: unknown }[] = [];

const renderSecurity = (
  permissions: Permission[],
  over: Partial<SecurityState> = {},
) => {
  dispatched = [];
  const organization: OrganizationSummary = {
    id: "acme",
    handle: "acme",
    name: "Acme",
    avatarUrl: null,
    personal: false,
    role: "OWNER",
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
      settings: SETTINGS,
      settingsStatus: "loaded" as const,
      domains: {
        items: [
          domain({}),
          domain({ id: "dom_2", domain: "corp.com", verified: true }),
        ],
        status: "loaded" as const,
        error: null,
      },
      sso: { items: [CONNECTION], status: "loaded" as const, error: null },
      ...over,
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <SecuritySettingsPage />
      </MemoryRouter>
    </Provider>,
  );
};

const failure = (over: Partial<SecurityFailure>): SecurityFailure => ({
  key: "",
  code: null,
  message: "",
  issues: {},
  detail: {},
  ...over,
});

describe("security settings", () => {
  it("shows the TXT record for an unverified domain and verifies on request", () => {
    renderSecurity(OWNER);

    const record = screen.getByTestId("domain-record-dom_1");
    expect(record).toHaveTextContent("_4mica-verification.acme.com");
    expect(record).toHaveTextContent("4mica-verification=tok");
    expect(
      within(record).getAllByRole("button", { name: "Copy" }),
    ).toHaveLength(3);

    fireEvent.click(screen.getByTestId("domain-verify-dom_1"));
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: securityActionTypes.SECURITY_OP_REQUESTED,
        payload: { op: "verifyDomain", id: "dom_1" },
      }),
    );
  });

  it("shows what DNS returned when verification fails", () => {
    renderSecurity(OWNER, {
      failure: failure({
        key: "verifyDomain:dom_1",
        code: "domain_unverified",
        message: "The TXT record was not found.",
        detail: { found: ["v=spf1 -all"] },
      }),
    });

    expect(screen.getByTestId("domain-verify-failure-dom_1")).toHaveTextContent(
      "Found instead: v=spf1 -all",
    );
  });

  it("lists the service-provider values to copy into the IdP", () => {
    renderSecurity(OWNER);

    const sp = screen.getByTestId("sso-sp-sso_1");
    expect(sp).toHaveTextContent("https://clerk.example/acs");
    expect(sp).toHaveTextContent("https://clerk.example/entity");
    expect(sp).toHaveTextContent("https://clerk.example/metadata");
  });

  it("explains what enforcing SSO does before turning it on", () => {
    renderSecurity(OWNER);

    fireEvent.click(screen.getByTestId("sso-enforce-sso_1-checkbox"));
    expect(
      dispatched.some(
        (action) => action.type === securityActionTypes.SECURITY_OP_REQUESTED,
      ),
    ).toBe(false);
    expect(
      screen.getByTestId("sso-enforce-dialog-sso_1-panel"),
    ).toHaveTextContent(
      "Every member with an @corp.com email will have to sign in through your identity provider",
    );

    fireEvent.click(screen.getByTestId("sso-enforce-dialog-sso_1-confirm"));
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        payload: { op: "updateSso", id: "sso_1", data: { enforced: true } },
      }),
    );
  });

  it("explains that Enterprise SSO must be enabled on Clerk", () => {
    renderSecurity(OWNER, {
      failure: failure({ key: "createSso", code: "sso_unavailable" }),
    });

    fireEvent.click(screen.getByTestId("sso-new"));
    expect(screen.getByTestId("sso-unavailable")).toHaveTextContent(
      "the Clerk instance",
    );
  });

  it("shows the caller's IP and adds it when the allowlist would lock them out", () => {
    renderSecurity(OWNER, {
      settings: { ...SETTINGS, ipAllowlist: ["10.0.0.0/8"] },
      failure: failure({
        key: "saveSettings",
        code: "would_lock_out",
        detail: { ip: "203.0.113.9" },
      }),
    });

    expect(screen.getByTestId("policies-would-lock-out")).toHaveTextContent(
      "203.0.113.9",
    );
    fireEvent.click(screen.getByTestId("policies-add-ip"));
    fireEvent.click(screen.getByTestId("policies-save"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: securityActionTypes.SAVE_SETTINGS_REQUESTED,
        payload: { ...SETTINGS, ipAllowlist: ["10.0.0.0/8", "203.0.113.9"] },
      }),
    );
  });

  it("blocks saving an allowlist with an invalid entry", () => {
    renderSecurity(OWNER);

    fireEvent.change(screen.getByLabelText("IP allowlist"), {
      target: { value: "10.0.0.0/8\nnot-an-ip" },
    });
    expect(
      screen.getByText("Not a valid IP address or CIDR range: not-an-ip"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("policies-save")).toBeDisabled();
  });

  it("is read-only for an admin and hides SSO details", () => {
    renderSecurity(["members.manage", "compliance.read"]);

    expect(screen.getByTestId("security-read-only")).toBeInTheDocument();
    expect(screen.getByTestId("sso-owner-only")).toBeInTheDocument();
    expect(screen.queryByTestId("domain-verify-dom_1")).toBeNull();
    expect(screen.queryByTestId("policies-save")).toBeNull();
  });
});

describe("security form helpers", () => {
  it("validates domains", () => {
    expect(isValidDomain("acme.com")).toBe(true);
    expect(isValidDomain("sub.acme.co.uk")).toBe(true);
    expect(isValidDomain("localhost")).toBe(false);
    expect(isValidDomain("1.2.3.4")).toBe(false);
    expect(isValidDomain("-bad.com")).toBe(false);
  });

  it("sends either the metadata URL or the manual IdP fields", () => {
    const t = (key: string) => key;
    const metadata = {
      ...emptySsoDraft("dom_1"),
      name: "Okta",
      idpMetadataUrl: "https://acme.okta.com/metadata",
    };
    expect(validateSsoDraft(metadata, t)).toEqual({});
    expect(toSsoInput(metadata)).not.toHaveProperty("idpCertificate");

    const manual = {
      ...metadata,
      mode: "manual" as const,
      idpEntityId: "urn:acme",
      idpSsoUrl: "http://insecure",
      idpCertificate: "nope",
    };
    expect(Object.keys(validateSsoDraft(manual, t)).sort()).toEqual([
      "idpCertificate",
      "idpSsoUrl",
    ]);
  });
});
