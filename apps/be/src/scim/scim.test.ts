import { clearUserCache } from "@auth/user-store";
import { projectRoutes } from "@routes/projects";
import { SCIM_PREFIX, scimRoutes } from "@routes/scim";
import { hashSecret } from "@utils/secrets";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { initApp } from "@/server";
import { scimDb } from "@/test-support/scim-db";

const clerkApi = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  getUserList: vi.fn(),
  createUser: vi.fn(),
  getSessionList: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: clerkApi.authenticateRequest,
    users: {
      getUser: clerkApi.getUser,
      getUserList: clerkApi.getUserList,
      createUser: clerkApi.createUser,
    },
    sessions: {
      getSessionList: clerkApi.getSessionList,
      revokeSession: clerkApi.revokeSession,
    },
  })),
}));

vi.mock("@4mica/db", async () => {
  const { scimDb: db } = await import("@/test-support/scim-db");
  return { prisma: db.prisma, disconnect: vi.fn(async () => {}) };
});

const TOKEN_A = "4mica_scim_token-for-org-a";
const TOKEN_B = "4mica_scim_token-for-org-b";
const REVOKED = "4mica_scim_revoked-token";
const DELETED_ORG_TOKEN = "4mica_scim_deleted-org-token";
const SCIM = "application/scim+json";

type Row = Record<string, unknown>;

const db = scimDb;
let app: Awaited<ReturnType<typeof initApp>>;
let orgA: Row;
let orgB: Row;
let tokenA: Row;
let clerkSeq = 0;

beforeAll(async () => {
  app = await initApp([
    { plugin: scimRoutes, prefix: SCIM_PREFIX },
    { plugin: projectRoutes },
  ]);
});

afterAll(async () => {
  await app.close();
});

const seedWorld = () => {
  db.reset();
  [orgA, orgB] = db.seed(
    "organization",
    { name: "Acme", personal: false },
    { name: "Globex", personal: false },
  ) as [Row, Row];
  const [deletedOrg] = db.seed("organization", {
    name: "Gone",
    deletedAt: new Date(),
  }) as [Row];
  [tokenA] = db.seed(
    "scimToken",
    { organizationId: orgA.id, name: "Okta", hashedToken: hashSecret(TOKEN_A) },
    {
      organizationId: orgB.id,
      name: "Entra",
      hashedToken: hashSecret(TOKEN_B),
    },
    {
      organizationId: orgA.id,
      name: "Old",
      hashedToken: hashSecret(REVOKED),
      revokedAt: new Date(),
    },
    {
      organizationId: deletedOrg?.id,
      name: "Gone",
      hashedToken: hashSecret(DELETED_ORG_TOKEN),
    },
  ) as [Row];
};

const seedMember = (
  orgId: unknown,
  email: string,
  over: Row = {},
  userOver: Row = {},
) => {
  clerkSeq += 1;
  const [user] = db.seed("user", {
    clerkUserId: `user_seed_${clerkSeq}`,
    email,
    name: email.split("@")[0],
    ...userOver,
  }) as [Row];
  db.seed("membership", {
    organizationId: orgId,
    userId: user.id,
    role: "VIEWER",
    source: "SCIM",
    ...over,
  });
  return user;
};

const scim = async (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  token = TOKEN_A,
) =>
  app.inject({
    method,
    url: `${SCIM_PREFIX}${path}`,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": SCIM }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });

const membershipOf = (orgId: unknown, userId: unknown) =>
  db
    .rows("membership")
    .find((row) => row.organizationId === orgId && row.userId === userId);

const audits = (action: string) =>
  db.rows("auditLog").filter((row) => row.action === action);

const patchOp = (...Operations: Row[]) => ({
  schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  Operations,
});

const clerkUser = (id: string, email: string) => ({
  id,
  firstName: null,
  lastName: null,
  imageUrl: "",
  emailAddresses: [{ emailAddress: email }],
});

beforeEach(() => {
  vi.clearAllMocks();
  clearUserCache();
  seedWorld();
  clerkApi.getUserList.mockResolvedValue({ data: [], totalCount: 0 });
  clerkApi.createUser.mockImplementation(
    async ({ emailAddress }: { emailAddress: string[] }) => {
      clerkSeq += 1;
      return clerkUser(`user_clerk_${clerkSeq}`, emailAddress[0] ?? "");
    },
  );
  clerkApi.getSessionList.mockResolvedValue({
    data: [{ id: "sess_1" }, { id: "sess_2" }],
    totalCount: 2,
  });
  clerkApi.revokeSession.mockResolvedValue({});
});

describe("SCIM authentication", () => {
  it.each([
    ["no token", undefined],
    ["a Clerk session token", "eyJhbGciOiJSUzI1NiJ9.session.sig"],
    ["an API key", "4mica_sk_test_abcdefghijklmnop"],
    ["an unknown SCIM token", "4mica_scim_unknown"],
    ["a revoked SCIM token", REVOKED],
    ["a token of a deleted organization", DELETED_ORG_TOKEN],
  ])("refuses %s with a SCIM error", async (_label, token) => {
    const res = await app.inject({
      method: "GET",
      url: `${SCIM_PREFIX}/Users`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain(SCIM);
    expect(res.json()).toMatchObject({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "401",
    });
    expect(clerkApi.authenticateRequest).not.toHaveBeenCalled();
  });

  it("records when a token was last used", async () => {
    await scim("GET", "/Users");
    await vi.waitFor(() => expect(tokenA.lastUsedAt).toBeInstanceOf(Date));
  });

  it("never shows one organization's users to another organization's token", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");
    seedMember(orgB.id, "bob@globex.com");

    const listA = (await scim("GET", "/Users")).json();
    const listB = (await scim("GET", "/Users", undefined, TOKEN_B)).json();

    expect(listA.Resources.map((u: Row) => u.userName)).toEqual([
      "ada@acme.com",
    ]);
    expect(listB.Resources.map((u: Row) => u.userName)).toEqual([
      "bob@globex.com",
    ]);

    const filtered = await scim(
      "GET",
      `/Users?filter=${encodeURIComponent('userName eq "ada@acme.com"')}`,
      undefined,
      TOKEN_B,
    );
    expect(filtered.json().totalResults).toBe(0);

    for (const [method, body] of [
      ["GET", undefined],
      ["PUT", { userName: "ada@acme.com", active: false }],
      ["PATCH", patchOp({ op: "replace", path: "active", value: false })],
      ["DELETE", undefined],
    ] as const) {
      const res = await scim(method, `/Users/${ada.id}`, body, TOKEN_B);
      expect(res.statusCode, method).toBe(404);
    }
    expect(membershipOf(orgA.id, ada.id)).toBeDefined();
  });

  it("will not put another organization's member into a group", async () => {
    const bob = seedMember(orgB.id, "bob@globex.com");
    const created = await scim("POST", "/Groups", {
      displayName: "Engineering",
      members: [{ value: bob.id }],
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().members).toEqual([]);

    const group = created.json();
    await scim(
      "PATCH",
      `/Groups/${group.id}`,
      patchOp({ op: "add", path: "members", value: [{ value: bob.id }] }),
    );
    expect(db.rows("scimGroupMember")).toEqual([]);
  });

  it("does not let a token address another organization's group", async () => {
    const created = await scim(
      "POST",
      "/Groups",
      { displayName: "Globex staff" },
      TOKEN_B,
    );
    const id = created.json().id;

    expect((await scim("GET", `/Groups/${id}`)).statusCode).toBe(404);
    expect((await scim("DELETE", `/Groups/${id}`)).statusCode).toBe(404);
    expect((await scim("GET", "/Groups")).json().totalResults).toBe(0);
  });
});

describe("SCIM discovery", () => {
  it("describes the service provider", async () => {
    const res = await scim("GET", "/ServiceProviderConfig");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain(SCIM);
    expect(res.json()).toMatchObject({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        expect.objectContaining({ type: "oauthbearertoken", primary: true }),
      ],
    });
  });

  it("lists the User and Group resource types", async () => {
    const list = (await scim("GET", "/ResourceTypes")).json();

    expect(list.schemas).toEqual([
      "urn:ietf:params:scim:api:messages:2.0:ListResponse",
    ]);
    expect(list.totalResults).toBe(2);
    expect(list.Resources).toEqual([
      expect.objectContaining({
        id: "User",
        endpoint: "/Users",
        schema: "urn:ietf:params:scim:schemas:core:2.0:User",
      }),
      expect.objectContaining({
        id: "Group",
        endpoint: "/Groups",
        schema: "urn:ietf:params:scim:schemas:core:2.0:Group",
      }),
    ]);
    expect((await scim("GET", "/ResourceTypes/User")).json().name).toBe("User");
    expect((await scim("GET", "/ResourceTypes/Device")).statusCode).toBe(404);
  });

  it("publishes the User and Group schemas", async () => {
    const list = (await scim("GET", "/Schemas")).json();
    const ids = list.Resources.map((schema: Row) => schema.id);

    expect(ids).toEqual([
      "urn:ietf:params:scim:schemas:core:2.0:User",
      "urn:ietf:params:scim:schemas:core:2.0:Group",
    ]);

    const user = (
      await scim("GET", "/Schemas/urn:ietf:params:scim:schemas:core:2.0:User")
    ).json();
    const names = user.attributes.map((attribute: Row) => attribute.name);
    expect(names).toEqual(
      expect.arrayContaining(["userName", "externalId", "active", "emails"]),
    );
    expect(
      user.attributes.find((attribute: Row) => attribute.name === "userName"),
    ).toMatchObject({ required: true, uniqueness: "server" });
  });
});

describe("SCIM user filters and paging", () => {
  const seedFive = () =>
    ["ada", "alan", "grace", "linus", "barbara"].map((name, index) =>
      seedMember(orgA.id, `${name}@acme.com`, {
        scimExternalId: `ext-${index}`,
      }),
    );

  const filter = async (expression: string) => {
    const res = await scim(
      "GET",
      `/Users?filter=${encodeURIComponent(expression)}`,
    );
    return { status: res.statusCode, body: res.json() };
  };

  const names = (body: { Resources: Row[] }) =>
    body.Resources.map((user) => user.userName);

  it("matches userName eq without regard to case", async () => {
    seedFive();
    const { body } = await filter('userName eq "GRACE@acme.com"');

    expect(body.totalResults).toBe(1);
    expect(names(body)).toEqual(["grace@acme.com"]);
    expect(body.Resources[0]).toMatchObject({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      active: true,
      emails: [{ value: "grace@acme.com", primary: true, type: "work" }],
      meta: { resourceType: "User" },
    });
  });

  it("matches externalId eq exactly", async () => {
    seedFive();

    expect(names((await filter('externalId eq "ext-3"')).body)).toEqual([
      "linus@acme.com",
    ]);
    expect((await filter('externalId eq "EXT-3"')).body.totalResults).toBe(0);
  });

  it("matches emails.value co and displayName sw", async () => {
    seedFive();

    expect(names((await filter('emails.value co "ar"')).body)).toEqual([
      "barbara@acme.com",
    ]);
    expect(names((await filter('displayName sw "a"')).body)).toEqual([
      "ada@acme.com",
      "alan@acme.com",
    ]);
  });

  it("joins expressions with and", async () => {
    seedFive();

    expect(
      names((await filter('userName sw "a" and externalId eq "ext-1"')).body),
    ).toEqual(["alan@acme.com"]);
  });

  it.each([
    ['userName gt "a"', "invalidFilter"],
    ['title eq "x"', "invalidFilter"],
    ['userName eq "a" or userName eq "b"', "invalidFilter"],
    ["userName eq ada", "invalidFilter"],
    ['userName eq "unterminated', "invalidFilter"],
  ])("rejects %s", async (expression, scimType) => {
    const { status, body } = await filter(expression);

    expect(status).toBe(400);
    expect(body).toMatchObject({ status: "400", scimType });
  });

  it("pages with startIndex and count", async () => {
    seedFive();
    const page = (await scim("GET", "/Users?startIndex=2&count=2")).json();

    expect(page).toMatchObject({
      totalResults: 5,
      startIndex: 2,
      itemsPerPage: 2,
    });
    expect(names(page)).toEqual(["alan@acme.com", "grace@acme.com"]);

    const counted = (await scim("GET", "/Users?count=0")).json();
    expect(counted).toMatchObject({ totalResults: 5, itemsPerPage: 0 });
    expect(counted.Resources).toEqual([]);

    const past = (await scim("GET", "/Users?startIndex=10")).json();
    expect(past).toMatchObject({ totalResults: 5, itemsPerPage: 0 });

    const clamped = (await scim("GET", "/Users?startIndex=0&count=500")).json();
    expect(clamped.startIndex).toBe(1);
    expect(clamped.itemsPerPage).toBe(5);
  });
});

describe("Okta provisioning flow", () => {
  const oktaUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: "ada@acme.com",
    name: { givenName: "Ada", familyName: "Lovelace" },
    emails: [{ primary: true, value: "ada@acme.com", type: "work" }],
    displayName: "Ada Lovelace",
    locale: "en-US",
    externalId: "00u1abcd",
    groups: [],
    password: "ignored",
    active: true,
  };

  it("creates, deactivates and reactivates a user", async () => {
    const lookup = await scim(
      "GET",
      `/Users?filter=${encodeURIComponent('userName eq "ada@acme.com"')}&startIndex=1&count=100`,
    );
    expect(lookup.json()).toMatchObject({ totalResults: 0, Resources: [] });

    const created = await scim("POST", "/Users", oktaUser);
    expect(created.statusCode).toBe(201);
    const user = created.json();
    expect(user).toMatchObject({
      userName: "ada@acme.com",
      externalId: "00u1abcd",
      active: true,
      displayName: "Ada Lovelace",
    });
    expect(created.headers.location).toBe(user.meta.location);
    expect(user.meta.location).toMatch(
      new RegExp(`/scim/v2/Users/${user.id}$`),
    );

    expect(clerkApi.getUserList).toHaveBeenCalledWith({
      emailAddress: ["ada@acme.com"],
    });
    expect(clerkApi.createUser).toHaveBeenCalledWith({
      emailAddress: ["ada@acme.com"],
      firstName: "Ada",
      lastName: "Lovelace",
      skipPasswordRequirement: true,
    });

    const membership = membershipOf(orgA.id, user.id);
    expect(membership).toMatchObject({
      role: "VIEWER",
      source: "SCIM",
      scimExternalId: "00u1abcd",
    });

    const personal = db
      .rows("membership")
      .filter((row) => row.userId === user.id && row.role === "OWNER");
    expect(personal).toHaveLength(1);
    expect(
      db
        .rows("organization")
        .find((org) => org.id === personal[0]?.organizationId),
    ).toMatchObject({ personal: true });

    expect(audits("scim.user.created")[0]).toMatchObject({
      organizationId: orgA.id,
      actorUserId: null,
      actorApiKeyId: null,
      targetId: user.id,
      metadata: expect.objectContaining({ scimTokenId: tokenA.id }),
    });

    const duplicate = await scim("POST", "/Users", oktaUser);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().scimType).toBe("uniqueness");

    const deactivated = await scim(
      "PATCH",
      `/Users/${user.id}`,
      patchOp({ op: "replace", value: { active: false } }),
    );
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json()).toMatchObject({
      id: user.id,
      active: false,
      externalId: "00u1abcd",
    });
    expect(membershipOf(orgA.id, user.id)).toBeUndefined();
    expect((await scim("GET", `/Users/${user.id}`)).json().active).toBe(false);
    expect((await scim("GET", "/Users")).json().totalResults).toBe(0);

    const reactivated = await scim(
      "PATCH",
      `/Users/${user.id}`,
      patchOp({ op: "replace", value: { active: true } }),
    );
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json()).toMatchObject({ id: user.id, active: true });
    expect(membershipOf(orgA.id, user.id)).toMatchObject({
      source: "SCIM",
      scimExternalId: "00u1abcd",
    });
    expect(audits("scim.user.deactivated")).toHaveLength(1);
    expect(audits("scim.user.reactivated")).toHaveLength(1);
  });

  it("links an existing Clerk user instead of creating one", async () => {
    clerkApi.getUserList.mockResolvedValue({
      data: [clerkUser("user_existing", "ada@acme.com")],
      totalCount: 1,
    });
    const [existing] = db.seed("user", {
      clerkUserId: "user_existing",
      email: "ada@acme.com",
      name: "Ada",
    }) as [Row];

    const created = await scim("POST", "/Users", oktaUser);

    expect(created.statusCode).toBe(201);
    expect(created.json().id).toBe(existing.id);
    expect(clerkApi.createUser).not.toHaveBeenCalled();
  });

  it("updates externalId through PUT and refuses a userName change", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");

    const replaced = await scim("PUT", `/Users/${ada.id}`, {
      ...oktaUser,
      externalId: "00u-new",
    });
    expect(replaced.statusCode).toBe(200);
    expect(membershipOf(orgA.id, ada.id)?.scimExternalId).toBe("00u-new");

    const renamed = await scim("PUT", `/Users/${ada.id}`, {
      ...oktaUser,
      userName: "someone@acme.com",
      emails: [],
    });
    expect(renamed.statusCode).toBe(400);
    expect(renamed.json().scimType).toBe("mutability");
  });

  it("deactivates through PUT active false", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");

    const res = await scim("PUT", `/Users/${ada.id}`, {
      ...oktaUser,
      active: false,
    });

    expect(res.json().active).toBe(false);
    expect(membershipOf(orgA.id, ada.id)).toBeUndefined();
  });

  it("answers a Clerk refusal with invalidValue and stores nothing", async () => {
    clerkApi.createUser.mockRejectedValue(
      Object.assign(new Error("bad"), {
        status: 422,
        errors: [{ longMessage: "That email is not allowed." }],
      }),
    );

    const res = await scim("POST", "/Users", oktaUser);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      scimType: "invalidValue",
      detail: "That email is not allowed.",
    });
    expect(db.rows("membership")).toEqual([]);
  });

  it("rejects a user without an email", async () => {
    const res = await scim("POST", "/Users", {
      userName: "ada",
      emails: [],
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().scimType).toBe("invalidValue");
  });

  it("rejects malformed JSON with a SCIM error", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${SCIM_PREFIX}/Users`,
      headers: { authorization: `Bearer ${TOKEN_A}`, "content-type": SCIM },
      payload: "{nope",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().schemas).toEqual([
      "urn:ietf:params:scim:api:messages:2.0:Error",
    ]);
  });
});

describe("Microsoft Entra PATCH shapes", () => {
  it("deactivates on a capitalized Replace with a string boolean", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");

    const res = await scim(
      "PATCH",
      `/Users/${ada.id}`,
      patchOp({ op: "Replace", path: "active", value: "False" }),
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
    expect(membershipOf(orgA.id, ada.id)).toBeUndefined();
  });

  it("applies Add on externalId and path-less Replace value objects", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");

    await scim(
      "PATCH",
      `/Users/${ada.id}`,
      patchOp({ op: "Add", path: "externalId", value: "entra-1" }),
    );
    expect(membershipOf(orgA.id, ada.id)?.scimExternalId).toBe("entra-1");

    const res = await scim(
      "PATCH",
      `/Users/${ada.id}`,
      patchOp({
        op: "Replace",
        value: {
          externalId: "entra-2",
          "name.givenName": "Ada",
          "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department":
            "R&D",
        },
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().externalId).toBe("entra-2");
  });

  it("adds and removes group members in Entra's shape", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");
    const alan = seedMember(orgA.id, "alan@acme.com");
    const group = (
      await scim("POST", "/Groups", {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
        displayName: "Engineering",
        externalId: "entra-group",
      })
    ).json();

    await scim(
      "PATCH",
      `/Groups/${group.id}`,
      patchOp({
        op: "Add",
        path: "members",
        value: [{ value: ada.id }, { value: alan.id }],
      }),
    );
    let members = (await scim("GET", `/Groups/${group.id}`)).json().members;
    expect(members.map((m: Row) => m.value).sort()).toEqual(
      [ada.id, alan.id].sort(),
    );

    await scim(
      "PATCH",
      `/Groups/${group.id}`,
      patchOp({ op: "Remove", path: "members", value: [{ value: ada.id }] }),
    );
    members = (await scim("GET", `/Groups/${group.id}`)).json().members;
    expect(members.map((m: Row) => m.value)).toEqual([alan.id]);

    await scim(
      "PATCH",
      `/Groups/${group.id}`,
      patchOp({
        op: "Replace",
        value: { id: group.id, displayName: "Platform" },
      }),
    );
    const renamed = (
      await scim("GET", `/Groups/${group.id}?excludedAttributes=members`)
    ).json();
    expect(renamed.displayName).toBe("Platform");
    expect(renamed.members).toBeUndefined();

    const byName = (
      await scim(
        "GET",
        `/Groups?filter=${encodeURIComponent('displayName eq "platform"')}&excludedAttributes=members`,
      )
    ).json();
    expect(byName.totalResults).toBe(1);
  });

  it("removes a member through Okta's value filter path", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");
    const group = (
      await scim("POST", "/Groups", {
        displayName: "Engineering",
        members: [{ value: ada.id }],
      })
    ).json();
    expect(group.members).toHaveLength(1);

    await scim(
      "PATCH",
      `/Groups/${group.id}`,
      patchOp({ op: "remove", path: `members[value eq "${ada.id}"]` }),
    );

    expect(db.rows("scimGroupMember")).toEqual([]);
  });

  it("refuses an unknown group path", async () => {
    const group = (
      await scim("POST", "/Groups", { displayName: "Engineering" })
    ).json();

    const res = await scim(
      "PATCH",
      `/Groups/${group.id}`,
      patchOp({ op: "replace", path: "owners", value: "x" }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().scimType).toBe("invalidPath");
  });

  it("refuses a duplicate group name", async () => {
    await scim("POST", "/Groups", { displayName: "Engineering" });
    const res = await scim("POST", "/Groups", { displayName: "Engineering" });

    expect(res.statusCode).toBe(409);
    expect(res.json().scimType).toBe("uniqueness");
  });
});

describe("group to role mapping", () => {
  const group = async (displayName: string, mapping: Row): Promise<string> => {
    const created = (await scim("POST", "/Groups", { displayName })).json();
    const row = db.rows("scimGroup").find((g) => g.id === created.id);
    Object.assign(row ?? {}, mapping);
    return created.id;
  };

  const addTo = (groupId: string, userId: unknown) =>
    scim(
      "PATCH",
      `/Groups/${groupId}`,
      patchOp({ op: "add", path: "members", value: [{ value: userId }] }),
    );

  const removeFrom = (groupId: string, userId: unknown) =>
    scim(
      "PATCH",
      `/Groups/${groupId}`,
      patchOp({ op: "remove", path: `members[value eq "${userId}"]` }),
    );

  it("gives each member the role of their highest-priority group", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");
    const admins = await group("Admins", { role: "ADMIN", priority: 10 });
    const finance = await group("Finance", { role: "FINANCE", priority: 5 });
    await group("Unmapped", {});

    await addTo(finance, ada.id);
    expect(membershipOf(orgA.id, ada.id)?.role).toBe("FINANCE");

    await addTo(admins, ada.id);
    expect(membershipOf(orgA.id, ada.id)?.role).toBe("ADMIN");

    await removeFrom(admins, ada.id);
    expect(membershipOf(orgA.id, ada.id)?.role).toBe("FINANCE");

    await removeFrom(finance, ada.id);
    expect(membershipOf(orgA.id, ada.id)?.role).toBe("VIEWER");

    const changes = audits("member.role_changed");
    expect(changes.map((row) => (row.metadata as Row).to)).toEqual([
      "FINANCE",
      "ADMIN",
      "FINANCE",
      "VIEWER",
    ]);
    expect(changes[0]).toMatchObject({
      actorUserId: null,
      actorApiKeyId: null,
      metadata: expect.objectContaining({ scimTokenId: tokenA.id }),
    });
  });

  it("never grants OWNER, whatever the group says", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");
    const owners = await group("Owners", { role: "OWNER", priority: 100 });

    await addTo(owners, ada.id);

    expect(membershipOf(orgA.id, ada.id)?.role).toBe("VIEWER");
    expect(audits("member.role_changed")).toEqual([]);
  });

  it("never changes an existing owner", async () => {
    const owner = seedMember(orgA.id, "owner@acme.com", { role: "OWNER" });
    const viewers = await group("Viewers", { role: "VIEWER", priority: 1 });

    await addTo(viewers, owner.id);

    expect(membershipOf(orgA.id, owner.id)?.role).toBe("OWNER");
  });

  it("maps a group to a custom role", async () => {
    const [role] = db.seed("customRole", {
      organizationId: orgA.id,
      name: "Auditor",
      permissions: ["audit.read"],
    }) as [Row];
    const ada = seedMember(orgA.id, "ada@acme.com");
    const auditors = await group("Auditors", {
      customRoleId: role.id,
      priority: 3,
    });

    await addTo(auditors, ada.id);

    expect(membershipOf(orgA.id, ada.id)).toMatchObject({
      role: "VIEWER",
      customRoleId: role.id,
    });
  });

  it("applies the mapping to users provisioned after joining a group", async () => {
    const admins = await group("Admins", { role: "ADMIN", priority: 10 });
    const ada = (
      await scim("POST", "/Users", { userName: "ada@acme.com" })
    ).json();
    await addTo(admins, ada.id);
    expect(membershipOf(orgA.id, ada.id)?.role).toBe("ADMIN");

    await scim(
      "PATCH",
      `/Users/${ada.id}`,
      patchOp({ op: "replace", path: "active", value: false }),
    );
    await scim(
      "PATCH",
      `/Users/${ada.id}`,
      patchOp({ op: "replace", path: "active", value: true }),
    );

    expect(membershipOf(orgA.id, ada.id)?.role).toBe("ADMIN");
  });

  it("recomputes roles when a group is deleted or its members replaced", async () => {
    const ada = seedMember(orgA.id, "ada@acme.com");
    const alan = seedMember(orgA.id, "alan@acme.com");
    const admins = await group("Admins", { role: "ADMIN", priority: 10 });
    await addTo(admins, ada.id);

    await scim("PUT", `/Groups/${admins}`, {
      displayName: "Admins",
      members: [{ value: alan.id }],
    });
    expect(membershipOf(orgA.id, ada.id)?.role).toBe("VIEWER");
    expect(membershipOf(orgA.id, alan.id)?.role).toBe("ADMIN");

    expect((await scim("DELETE", `/Groups/${admins}`)).statusCode).toBe(204);
    expect(membershipOf(orgA.id, alan.id)?.role).toBe("VIEWER");
    expect(audits("scim.group.deleted")).toHaveLength(1);
  });
});

describe("deprovisioning", () => {
  const seedFootprint = () => {
    const ada = seedMember(
      orgA.id,
      "ada@acme.com",
      {},
      {
        clerkUserId: "user_ada",
        defaultOrganizationId: orgA.id,
      },
    );
    db.seed("membership", {
      organizationId: orgB.id,
      userId: ada.id,
      role: "DEVELOPER",
    });
    const [projectA, projectB] = db.seed(
      "project",
      { organizationId: orgA.id, name: "A" },
      { organizationId: orgB.id, name: "B" },
    ) as [Row, Row];
    db.seed(
      "projectMembership",
      { projectId: projectA.id, userId: ada.id },
      { projectId: projectB.id, userId: ada.id },
    );
    db.seed(
      "cliSession",
      { userId: ada.id, organizationId: orgA.id, name: "bound to A" },
      { userId: ada.id, organizationId: orgB.id, name: "bound to B" },
      { userId: ada.id, organizationId: null, name: "unbound" },
    );
    const [groupA] = db.seed("scimGroup", {
      organizationId: orgA.id,
      displayName: "Engineering",
    }) as [Row];
    db.seed("scimGroupMember", { groupId: groupA.id, userId: ada.id });
    return { ada, projectA, projectB };
  };

  const sessions = () =>
    Object.fromEntries(
      db.rows("cliSession").map((row) => [row.name, row.revokedAt !== null]),
    );

  it("removes the membership, project access, org-bound CLI sessions and managed Clerk sessions", async () => {
    db.seed("organizationDomain", {
      organizationId: orgA.id,
      domain: "acme.com",
      verifiedAt: new Date(),
    });
    const { ada, projectB } = seedFootprint();

    const res = await scim("DELETE", `/Users/${ada.id}`);

    expect(res.statusCode).toBe(204);
    expect(membershipOf(orgA.id, ada.id)).toBeUndefined();
    expect(membershipOf(orgB.id, ada.id)).toBeDefined();
    expect(db.rows("projectMembership")).toEqual([
      expect.objectContaining({ projectId: projectB.id }),
    ]);
    expect(sessions()).toEqual({
      "bound to A": true,
      "bound to B": false,
      unbound: false,
    });
    expect(db.rows("scimGroupMember")).toEqual([]);
    expect(
      db.rows("user").find((row) => row.id === ada.id)?.defaultOrganizationId,
    ).toBeNull();
    expect(clerkApi.getSessionList).toHaveBeenCalledWith({
      userId: "user_ada",
      status: "active",
    });
    expect(clerkApi.revokeSession).toHaveBeenCalledTimes(2);
    expect(audits("scim.user.deleted")[0]).toMatchObject({
      actorUserId: null,
      actorApiKeyId: null,
      metadata: expect.objectContaining({
        scimTokenId: tokenA.id,
        revokedCliSessions: 1,
        revokedClerkSessions: 2,
      }),
    });

    expect(audits("member.deprovisioned")[0]).toMatchObject({
      organizationId: orgA.id,
      targetType: "user",
      targetId: ada.id,
      actorUserId: null,
      metadata: expect.objectContaining({ scimTokenId: tokenA.id }),
    });

    expect((await scim("GET", `/Users/${ada.id}`)).statusCode).toBe(404);
  });

  it("shuts an unbound CLI session out of the organization that deprovisioned its user", async () => {
    const { ada } = seedFootprint();
    const token = "4mica_cli_unbound-session-token";
    db.seed("cliSession", {
      userId: ada.id,
      organizationId: null,
      name: "laptop",
      kind: "DEVICE",
      hashedToken: hashSecret(token),
      scopes: ["account:read"],
      mfaVerified: false,
      lastUsedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    });
    const projectsIn = (orgId: unknown) =>
      app.inject({
        method: "GET",
        url: "/me/projects",
        headers: {
          authorization: `Bearer ${token}`,
          "x-org-id": String(orgId),
        },
      });

    expect((await projectsIn(orgA.id)).statusCode).toBe(200);

    await scim("DELETE", `/Users/${ada.id}`);

    expect((await projectsIn(orgA.id)).statusCode).toBe(404);
    expect((await projectsIn(orgB.id)).statusCode).toBe(200);
  });

  it("keeps group memberships on deactivation so reactivation restores the role", async () => {
    const { ada } = seedFootprint();

    await scim(
      "PATCH",
      `/Users/${ada.id}`,
      patchOp({ op: "replace", path: "active", value: false }),
    );

    expect(db.rows("scimGroupMember")).toHaveLength(1);
    expect(sessions()["bound to A"]).toBe(true);
    expect(audits("member.deprovisioned")).toHaveLength(1);
  });

  it("leaves Clerk sessions alone when the domain is not verified by this organization", async () => {
    db.seed(
      "organizationDomain",
      { organizationId: orgA.id, domain: "acme.com", verifiedAt: null },
      { organizationId: orgB.id, domain: "acme.com", verifiedAt: new Date() },
    );
    const { ada } = seedFootprint();

    await scim("DELETE", `/Users/${ada.id}`);

    expect(clerkApi.getSessionList).not.toHaveBeenCalled();
    expect(clerkApi.revokeSession).not.toHaveBeenCalled();
    expect(membershipOf(orgA.id, ada.id)).toBeUndefined();
  });

  it("refuses to deprovision an owner", async () => {
    const owner = seedMember(orgA.id, "owner@acme.com", { role: "OWNER" });

    const res = await scim("DELETE", `/Users/${owner.id}`);

    expect(res.statusCode).toBe(400);
    expect(res.json().scimType).toBe("mutability");
    expect(membershipOf(orgA.id, owner.id)).toBeDefined();
  });

  it("answers 404 for a user that never belonged to the organization", async () => {
    const res = await scim(
      "DELETE",
      "/Users/019fce62-0000-7000-8000-00000000dead",
    );

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ status: "404" });
  });
});
