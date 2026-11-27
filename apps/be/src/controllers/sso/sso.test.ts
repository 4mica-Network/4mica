import type { Tenant } from "@auth/tenant";
import { clearUserCache } from "@auth/user-store";
import { domainRoutes } from "@routes/domains";
import { ssoRoutes } from "@routes/sso";
import { clearClerkUserCache } from "@services/clerk-users";
import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { governOff } from "@/test-support/governance";
import {
  actInOrg,
  clerkUser,
  HEADERS,
  type IdentityDb,
  ORG,
  resetIdentity,
  signedIn,
  USER_ID,
} from "@/test-support/identity-db";
import { OTHER_ORG_ID } from "@/test-support/tenancy";
import { ssoRequirement } from "./enforcement";

const h = vi.hoisted(() => {
  process.env.RATE_LIMIT_ENABLED = "false";
  return {
    store: null as unknown as IdentityDb,
    authenticateRequest: vi.fn(),
    getUser: vi.fn(),
    saml: {
      createSamlConnection: vi.fn(),
      getSamlConnection: vi.fn(),
      updateSamlConnection: vi.fn(),
      deleteSamlConnection: vi.fn(),
    },
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: h.authenticateRequest,
    users: { getUser: h.getUser },
    samlConnections: h.saml,
  })),
}));

vi.mock("@4mica/db", async () => {
  const { sqltag, join, empty } = await import("@prisma/client/runtime/client");
  const { createIdentityDb } = await import("@/test-support/identity-db");
  h.store = createIdentityDb();
  return {
    Prisma: { sql: sqltag, join, empty },
    prisma: h.store.db,
    disconnect: vi.fn(async () => {}),
  };
});

const { authenticateRequest, getUser, saml } = h;
const db = h.store.db;
const tables = h.store.tables;
const fake = h.store.fake;

const CERT = `-----BEGIN CERTIFICATE-----${"A".repeat(120)}-----END CERTIFICATE-----`;

const clerkConnection = (over: Record<string, unknown> = {}) => ({
  id: "samlc_new",
  active: false,
  acsUrl: "https://clerk.example.com/v1/saml/acs/samlc_new",
  spEntityId: "https://clerk.example.com/saml/samlc_new",
  spMetadataUrl: "https://clerk.example.com/v1/saml/metadata/samlc_new",
  idpCertificate: CERT,
  ...over,
});

const clerkError = (
  status: number,
  errors: { code: string; message: string; meta?: object }[],
) => Object.assign(new Error("clerk"), { status, errors });

const app = () => initApp([{ plugin: ssoRoutes }, { plugin: domainRoutes }]);

const verifiedDomain = () => fake.domain({ verifiedAt: new Date() });

const create = async (payload: Record<string, unknown>) =>
  (await app()).inject({
    method: "POST",
    url: "/me/organization/sso",
    headers: HEADERS,
    payload,
  });

const patch = async (id: unknown, payload: Record<string, unknown>) =>
  (await app()).inject({
    method: "PATCH",
    url: `/me/organization/sso/${id}`,
    headers: HEADERS,
    payload,
  });

beforeEach(() => {
  clearUserCache();
  clearClerkUserCache();
  authenticateRequest.mockReset();
  authenticateRequest.mockResolvedValue(signedIn());
  getUser.mockReset();
  getUser.mockResolvedValue(clerkUser());
  for (const fn of Object.values(saml)) {
    fn.mockReset();
  }
  resetIdentity(h.store);
  governOff(db);
});

describe("creating a connection", () => {
  it("creates an inactive Clerk SAML connection from a metadata URL", async () => {
    const domain = verifiedDomain();
    saml.createSamlConnection.mockResolvedValue(clerkConnection());

    const res = await create({
      domainId: domain.id,
      provider: "MICROSOFT_ENTRA",
      name: "Entra",
      idpMetadataUrl: "https://login.microsoftonline.com/x/metadata.xml",
    });

    expect(res.statusCode).toBe(201);
    expect(saml.createSamlConnection).toHaveBeenCalledWith({
      name: "Entra",
      provider: "saml_microsoft",
      domain: "acme.com",
      idpMetadataUrl: "https://login.microsoftonline.com/x/metadata.xml",
    });
    expect(res.json()).toMatchObject({
      domain: "acme.com",
      provider: "MICROSOFT_ENTRA",
      active: false,
      enforced: false,
      jitProvisioning: true,
      defaultRole: "VIEWER",
      serviceProvider: {
        acsUrl: "https://clerk.example.com/v1/saml/acs/samlc_new",
        entityId: "https://clerk.example.com/saml/samlc_new",
        metadataUrl: "https://clerk.example.com/v1/saml/metadata/samlc_new",
      },
    });
    expect(tables.ssoConnection[0]?.clerkConnectionId).toBe("samlc_new");
    expect(tables.auditLogs.map((row) => row.action)).toContain("sso.created");
  });

  it.each([
    ["OKTA", "saml_okta"],
    ["GOOGLE_WORKSPACE", "saml_google"],
    ["CUSTOM", "saml_custom"],
  ])("maps %s to %s", async (provider, slug) => {
    const domain = verifiedDomain();
    saml.createSamlConnection.mockResolvedValue(clerkConnection());
    await create({
      domainId: domain.id,
      provider,
      name: "IdP",
      idpMetadataUrl: "https://idp.example.com/metadata",
    });
    expect(saml.createSamlConnection.mock.calls[0]?.[0].provider).toBe(slug);
  });

  it("passes the certificate to Clerk and never stores or returns it", async () => {
    const domain = verifiedDomain();
    saml.createSamlConnection.mockResolvedValue(clerkConnection());

    const res = await create({
      domainId: domain.id,
      provider: "OKTA",
      name: "Okta",
      idpEntityId: "http://www.okta.com/exk1",
      idpSsoUrl: "https://acme.okta.com/app/sso/saml",
      idpCertificate: CERT,
    });

    expect(res.statusCode).toBe(201);
    expect(saml.createSamlConnection.mock.calls[0]?.[0]).toMatchObject({
      idpEntityId: "http://www.okta.com/exk1",
      idpCertificate: CERT,
    });
    expect(res.body).not.toContain("BEGIN CERTIFICATE");
    expect(JSON.stringify(tables.ssoConnection)).not.toContain(
      "BEGIN CERTIFICATE",
    );
    expect(JSON.stringify(tables.auditLogs)).not.toContain("BEGIN CERTIFICATE");
  });

  it("needs a metadata URL or the full IdP triple", async () => {
    const domain = verifiedDomain();
    const res = await create({
      domainId: domain.id,
      provider: "OKTA",
      name: "Okta",
      idpEntityId: "http://www.okta.com/exk1",
    });
    expect(res.statusCode).toBe(400);
    expect(saml.createSamlConnection).not.toHaveBeenCalled();
  });

  it("needs a verified domain of this organization", async () => {
    const unverified = fake.domain();
    const foreign = fake.domain({
      organizationId: OTHER_ORG_ID,
      verifiedAt: new Date(),
    });
    const body = {
      provider: "OKTA",
      name: "Okta",
      idpMetadataUrl: "https://idp.example.com/metadata",
    };

    expect(
      (await create({ ...body, domainId: unverified.id })).statusCode,
    ).toBe(409);
    expect((await create({ ...body, domainId: foreign.id })).statusCode).toBe(
      404,
    );
    expect(saml.createSamlConnection).not.toHaveBeenCalled();
  });

  it("answers 409 sso_unavailable and stores nothing when Clerk lacks the feature", async () => {
    const domain = verifiedDomain();
    saml.createSamlConnection.mockRejectedValue(
      clerkError(403, [
        { code: "feature_not_enabled", message: "SAML is not enabled" },
      ]),
    );
    const res = await create({
      domainId: domain.id,
      provider: "OKTA",
      name: "Okta",
      idpMetadataUrl: "https://idp.example.com/metadata",
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("sso_unavailable");
    expect(tables.ssoConnection).toEqual([]);
  });

  it("maps Clerk validation errors to 400 with issues", async () => {
    const domain = verifiedDomain();
    saml.createSamlConnection.mockRejectedValue(
      clerkError(422, [
        {
          code: "form_param_format_invalid",
          message: "is invalid",
          meta: { paramName: "idp_metadata_url" },
        },
      ]),
    );
    const res = await create({
      domainId: domain.id,
      provider: "OKTA",
      name: "Okta",
      idpMetadataUrl: "https://idp.example.com/metadata",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([
      { path: "idpMetadataUrl", message: "is invalid" },
    ]);
  });

  it("answers 502 when Clerk is unreachable", async () => {
    const domain = verifiedDomain();
    saml.createSamlConnection.mockRejectedValue(new Error("ECONNRESET"));
    const res = await create({
      domainId: domain.id,
      provider: "OKTA",
      name: "Okta",
      idpMetadataUrl: "https://idp.example.com/metadata",
    });
    expect(res.statusCode).toBe(502);
  });

  it("needs a recent sign-in", async () => {
    const domain = verifiedDomain();
    authenticateRequest.mockResolvedValue(signedIn([60, -1]));
    const res = await create({
      domainId: domain.id,
      provider: "OKTA",
      name: "Okta",
      idpMetadataUrl: "https://idp.example.com/metadata",
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: "reauth_required",
      reauthWithinMinutes: 15,
    });
  });

  it("refuses personal organizations", async () => {
    actInOrg(db, "OWNER", true);
    const res = await create({
      domainId: verifiedDomain().id,
      provider: "OKTA",
      name: "Okta",
      idpMetadataUrl: "https://idp.example.com/metadata",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("personal_organization");
  });
});

describe("updating a connection", () => {
  it("refuses enforcement without activation", async () => {
    const domain = verifiedDomain();
    const connection = fake.connection({ domainId: domain.id, active: false });
    const res = await patch(connection.id, { enforced: true });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("sso_inactive");
    expect(saml.updateSamlConnection).not.toHaveBeenCalled();
  });

  it("activates through Clerk and stores what Clerk confirmed", async () => {
    const domain = verifiedDomain();
    const connection = fake.connection({ domainId: domain.id, active: false });
    saml.updateSamlConnection.mockResolvedValue(
      clerkConnection({ id: "samlc_1", active: true }),
    );
    const res = await patch(connection.id, { active: true });
    expect(res.statusCode).toBe(200);
    expect(saml.updateSamlConnection).toHaveBeenCalledWith("samlc_1", {
      active: true,
    });
    expect(res.json().active).toBe(true);
  });

  it("does not claim activation Clerk did not perform", async () => {
    const domain = verifiedDomain();
    const connection = fake.connection({ domainId: domain.id, active: false });
    saml.updateSamlConnection.mockResolvedValue(
      clerkConnection({ active: false }),
    );
    const res = await patch(connection.id, { active: true });
    expect(res.statusCode).toBe(409);
    expect(tables.ssoConnection[0]?.active).toBe(false);
  });

  it("drops enforcement when the connection is deactivated", async () => {
    const domain = verifiedDomain();
    const connection = fake.connection({
      domainId: domain.id,
      active: true,
      enforced: true,
    });
    getUser.mockResolvedValue(
      clerkUser({
        samlAccounts: [{ active: true, samlConnection: { id: "samlc_1" } }],
      }),
    );
    saml.updateSamlConnection.mockResolvedValue(
      clerkConnection({ active: false }),
    );
    const res = await patch(connection.id, { active: false });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ active: false, enforced: false });
  });

  it("refuses to enforce SSO the caller has not signed in with", async () => {
    const domain = verifiedDomain();
    const connection = fake.connection({ domainId: domain.id });
    const res = await patch(connection.id, { enforced: true });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("would_lock_out");
  });

  it("enforces once the caller has signed in through the connection", async () => {
    const domain = verifiedDomain();
    const connection = fake.connection({ domainId: domain.id });
    getUser.mockResolvedValue(
      clerkUser({
        samlAccounts: [{ active: true, samlConnection: { id: "samlc_1" } }],
      }),
    );
    saml.getSamlConnection.mockResolvedValue(
      clerkConnection({ id: "samlc_1", active: true }),
    );
    const res = await patch(connection.id, { enforced: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().enforced).toBe(true);
    expect(saml.updateSamlConnection).not.toHaveBeenCalled();
  });

  it("rotates the certificate through Clerk without echoing it", async () => {
    const domain = verifiedDomain();
    const connection = fake.connection({ domainId: domain.id });
    saml.updateSamlConnection.mockResolvedValue(
      clerkConnection({ active: true }),
    );
    const res = await patch(connection.id, { idpCertificate: CERT });
    expect(res.statusCode).toBe(200);
    expect(saml.updateSamlConnection).toHaveBeenCalledWith("samlc_1", {
      idpCertificate: CERT,
    });
    expect(res.body).not.toContain("BEGIN CERTIFICATE");
    expect(JSON.stringify(tables.auditLogs)).not.toContain("BEGIN CERTIFICATE");
  });

  it("answers 404 for another organization's connection", async () => {
    const domain = fake.domain({
      organizationId: OTHER_ORG_ID,
      verifiedAt: new Date(),
    });
    const connection = fake.connection({
      organizationId: OTHER_ORG_ID,
      domainId: domain.id,
    });
    const res = await patch(connection.id, { name: "Mine" });
    expect(res.statusCode).toBe(404);
  });
});

describe("listing and deleting", () => {
  it("lists connections with Clerk's service provider details", async () => {
    const domain = verifiedDomain();
    fake.connection({ domainId: domain.id });
    saml.getSamlConnection.mockResolvedValue(
      clerkConnection({ id: "samlc_1" }),
    );
    const res = await (await app()).inject({
      method: "GET",
      url: "/me/organization/sso",
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].serviceProvider.acsUrl).toContain("/acs/");
    expect(res.body).not.toContain("BEGIN CERTIFICATE");
  });

  it("deletes the Clerk connection and the row", async () => {
    const domain = verifiedDomain();
    const connection = fake.connection({ domainId: domain.id });
    saml.deleteSamlConnection.mockRejectedValue(
      clerkError(404, [{ code: "resource_not_found", message: "gone" }]),
    );
    const res = await (await app()).inject({
      method: "DELETE",
      url: `/me/organization/sso/${connection.id}`,
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(204);
    expect(saml.deleteSamlConnection).toHaveBeenCalledWith("samlc_1");
    expect(tables.ssoConnection).toEqual([]);
  });
});

describe("ssoRequirement", () => {
  const tenant: Tenant = {
    orgId: ORG,
    userId: USER_ID,
    role: "DEVELOPER",
    personal: false,
  };
  const request = (over: Record<string, unknown> = {}) =>
    ({
      user: { clerkUserId: "user_123", email: "ada@acme.com" },
      cliSession: null,
      ...over,
    }) as unknown as FastifyRequest;

  const enforced = () => {
    const domain = verifiedDomain();
    fake.connection({ domainId: domain.id, enforced: true });
  };

  it("is null without an enforced connection", async () => {
    fake.connection({ domainId: verifiedDomain().id });
    expect(await ssoRequirement(request(), tenant)).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("requires SSO for a matching primary email domain", async () => {
    enforced();
    expect(await ssoRequirement(request(), tenant)).toEqual({
      domain: "acme.com",
    });
  });

  it("is satisfied by a SAML account for the connection", async () => {
    enforced();
    getUser.mockResolvedValue(
      clerkUser({
        samlAccounts: [{ active: true, samlConnection: { id: "samlc_1" } }],
      }),
    );
    expect(await ssoRequirement(request(), tenant)).toBeNull();
  });

  it("is not satisfied by a SAML account for another connection", async () => {
    enforced();
    getUser.mockResolvedValue(
      clerkUser({
        samlAccounts: [{ active: true, samlConnection: { id: "samlc_x" } }],
      }),
    );
    expect(await ssoRequirement(request(), tenant)).toEqual({
      domain: "acme.com",
    });
  });

  it("ignores members from other domains", async () => {
    enforced();
    getUser.mockResolvedValue(
      clerkUser({
        emailAddresses: [
          {
            id: "idn_1",
            emailAddress: "contractor@elsewhere.io",
            verification: { status: "verified" },
          },
        ],
      }),
    );
    expect(await ssoRequirement(request(), tenant)).toBeNull();
  });

  it("does not apply to personal orgs or CLI tokens", async () => {
    enforced();
    expect(
      await ssoRequirement(request(), { ...tenant, personal: true }),
    ).toBeNull();
    expect(
      await ssoRequirement(request({ cliSession: { id: "cli" } }), tenant),
    ).toBeNull();
  });

  it("fails closed when Clerk is unreachable", async () => {
    enforced();
    getUser.mockRejectedValue(new Error("down"));
    expect(await ssoRequirement(request(), tenant)).toEqual({
      domain: "acme.com",
    });
  });

  it("caches the Clerk user", async () => {
    enforced();
    await ssoRequirement(request(), tenant);
    await ssoRequirement(request(), tenant);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("answers 403 sso_required on tenant routes", async () => {
    enforced();
    const res = await (await app()).inject({
      method: "GET",
      url: "/me/organization/domains",
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: "sso_required",
      domain: "acme.com",
    });
  });
});
