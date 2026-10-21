import { clearUserCache } from "@auth/user-store";
import { complianceRoutes } from "@routes/compliance";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  business,
  complianceProfile,
  beneficialOwner,
  $transaction,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  business: { findUnique: vi.fn(), update: vi.fn() },
  complianceProfile: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  beneficialOwner: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent: { count: vi.fn() },
    user: { findUnique, upsert, update: vi.fn() },
    business,
    complianceProfile,
    beneficialOwner,
    $transaction,
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";

const AUTH_USER = {
  id: USER_ID,
  clerkUserId: "user_123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
};

const signedIn = () => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: "user_123",
    sessionId: "sess_123",
    sessionClaims: { sub: "user_123", sid: "sess_123" },
  }),
});

const AUTH = { authorization: "Bearer good" };

const COMPLETE_BUSINESS = {
  legalName: "Atlas Research Ltd",
  businessType: "LLC",
  registrationNumber: "12345678",
  taxId: "GB123",
  website: "https://atlas.example",
  addressLine1: "1 Market St",
  city: "London",
  postalCode: "EC1A 1AA",
  country: "GB",
  kybStatus: "UNVERIFIED",
};

const COMPLETE_PROFILE = {
  incorporationCountry: "GB",
  incorporatedOn: new Date("2020-01-01T00:00:00Z"),
  monthlyVolume: "UNDER_10K",
  customerBase: "BUSINESSES",
  customerRegions: ["GB"],
  isRegulated: false,
  licenceType: null,
  licenceNumber: null,
  regulator: null,
  hasAmlPolicy: true,
  complianceOfficerName: "Ada Lovelace",
  complianceOfficerEmail: "ada@atlas.example",
  termsUrl: "https://atlas.example/terms",
  privacyUrl: "https://atlas.example/privacy",
  refundPolicyUrl: null,
  fundsSource: "BUSINESS_REVENUE",
  fundsSourceDetail: null,
  sanctionsAttestedAt: new Date(),
  prohibitedAttestedAt: new Date(),
  accuracyAttestedAt: new Date(),
  attestedBy: "Ada Lovelace",
  submittedAt: null,
  updatedAt: new Date(),
};

const STORED_OWNER = {
  id: "019fce62-0000-7000-8000-0000000000aa",
  fullName: "Ada Lovelace",
  role: "OWNER",
  ownershipPercent: 60,
  dateOfBirth: new Date("1985-12-10T00:00:00Z"),
  nationality: "GB",
  countryOfResidence: "GB",
  email: null,
  isPep: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const NEW_OWNER = {
  fullName: "Charles Babbage",
  role: "OWNER",
  ownershipPercent: 40,
  dateOfBirth: "1971-12-26",
  nationality: "GB",
  countryOfResidence: "GB",
};

const call = async (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
  headers: Record<string, string> = AUTH,
) => {
  const app = await initApp([{ plugin: complianceRoutes }]);
  const res = await app.inject({
    method,
    url,
    headers,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  await app.close();
  return res;
};

describe("compliance routes", () => {
  beforeEach(() => {
    for (const m of [
      authenticateRequest,
      getUser,
      findUnique,
      upsert,
      $transaction,
    ]) {
      m.mockReset();
    }
    for (const group of [business, complianceProfile, beneficialOwner]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);
    business.findUnique.mockResolvedValue(COMPLETE_BUSINESS);
    complianceProfile.findUnique.mockResolvedValue(COMPLETE_PROFILE);
    beneficialOwner.findMany.mockResolvedValue([STORED_OWNER]);
    beneficialOwner.findUnique.mockResolvedValue(STORED_OWNER);
    beneficialOwner.create.mockResolvedValue(STORED_OWNER);
    beneficialOwner.updateMany.mockResolvedValue({ count: 1 });
    beneficialOwner.deleteMany.mockResolvedValue({ count: 1 });
    beneficialOwner.count.mockResolvedValue(1);
    beneficialOwner.aggregate.mockResolvedValue({
      _sum: { ownershipPercent: 60 },
    });
    $transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
  });

  it("refuses a caller without a session", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: false,
      status: "signed-out",
      reason: "session-token-missing",
      toAuth: () => ({ tokenType: null, userId: null }),
    });

    const res = await call("GET", "/me/compliance", undefined, {});

    expect(res.statusCode).toBe(401);
  });

  describe("GET /me/compliance", () => {
    it("lists everything still missing for a new seller", async () => {
      business.findUnique.mockResolvedValue(null);
      complianceProfile.findUnique.mockResolvedValue(null);
      beneficialOwner.findMany.mockResolvedValue([]);

      const res = await call("GET", "/me/compliance");

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        kybStatus: "UNVERIFIED",
        profile: null,
        owners: [],
      });
      expect(res.json().missing).toContain("business.legalName");
      expect(res.json().missing).toContain("owners");
      expect(res.json().missing).toContain("attestations");
    });

    it("reads only the caller's records and sends dates as plain dates", async () => {
      const res = await call("GET", "/me/compliance");

      expect(complianceProfile.findUnique.mock.calls[0][0].where).toEqual({
        ownerId: USER_ID,
      });
      expect(beneficialOwner.findMany.mock.calls[0][0].where).toEqual({
        ownerId: USER_ID,
      });
      expect(res.json().profile.incorporatedOn).toBe("2020-01-01");
      expect(res.json().owners[0].dateOfBirth).toBe("1985-12-10");
      expect(res.json().missing).toEqual([]);
    });
  });

  describe("PATCH /me/compliance", () => {
    it("rejects a malformed country code", async () => {
      const res = await call("PATCH", "/me/compliance", {
        incorporationCountry: "Britain",
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("incorporationCountry");
      expect(complianceProfile.upsert).not.toHaveBeenCalled();
    });

    it("rejects an incorporation date in the future", async () => {
      const res = await call("PATCH", "/me/compliance", {
        incorporatedOn: "2999-01-01",
      });

      expect(res.statusCode).toBe(400);
    });

    it("stamps a new attestation, keeps an old one and clears a withdrawn one", async () => {
      const signedEarlier = new Date("2026-01-01T00:00:00Z");
      complianceProfile.findUnique.mockResolvedValue({
        ...COMPLETE_PROFILE,
        sanctionsAttestedAt: signedEarlier,
        prohibitedAttestedAt: null,
      });

      const res = await call("PATCH", "/me/compliance", {
        sanctionsAttested: true,
        prohibitedAttested: true,
        accuracyAttested: false,
        customerRegions: ["gb", "GB", "us"],
      });

      expect(res.statusCode).toBe(200);
      const { update, create } = complianceProfile.upsert.mock.calls[0][0];
      expect(update.sanctionsAttestedAt).toBe(signedEarlier);
      expect(update.prohibitedAttestedAt).toBeInstanceOf(Date);
      expect(update.accuracyAttestedAt).toBeNull();
      expect(update.customerRegions).toEqual(["GB", "US"]);
      expect(create.ownerId).toBe(USER_ID);
    });

    it("leaves attestations alone when the request does not mention them", async () => {
      await call("PATCH", "/me/compliance", { regulator: "FCA" });

      const { update } = complianceProfile.upsert.mock.calls[0][0];
      expect(update.sanctionsAttestedAt).toBeUndefined();
      expect(update.regulator).toBe("FCA");
    });

    it.each([
      "PENDING",
      "VERIFIED",
    ])("locks the details while the business is %s", async (kybStatus) => {
      business.findUnique.mockResolvedValue({
        ...COMPLETE_BUSINESS,
        kybStatus,
      });

      const res = await call("PATCH", "/me/compliance", { regulator: "FCA" });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("compliance_locked");
      expect(complianceProfile.upsert).not.toHaveBeenCalled();
    });
  });

  describe("beneficial owners", () => {
    it("adds a person under the caller's account", async () => {
      const res = await call("POST", "/me/compliance/owners", NEW_OWNER);

      expect(res.statusCode).toBe(201);
      const { data } = beneficialOwner.create.mock.calls[0][0];
      expect(data.ownerId).toBe(USER_ID);
      expect(data.dateOfBirth).toEqual(new Date("1971-12-26T00:00:00Z"));
      expect(data.isPep).toBe(false);
    });

    it("needs an ownership share from an owner", async () => {
      const res = await call("POST", "/me/compliance/owners", {
        ...NEW_OWNER,
        ownershipPercent: null,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("ownershipPercent");
    });

    it("does not need a share from a director", async () => {
      const res = await call("POST", "/me/compliance/owners", {
        ...NEW_OWNER,
        role: "DIRECTOR",
        ownershipPercent: null,
      });

      expect(res.statusCode).toBe(201);
    });

    it("refuses someone under eighteen", async () => {
      const minor = new Date();
      minor.setUTCFullYear(minor.getUTCFullYear() - 10);

      const res = await call("POST", "/me/compliance/owners", {
        ...NEW_OWNER,
        dateOfBirth: minor.toISOString().slice(0, 10),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("dateOfBirth");
    });

    it("never lets the shares add up to more than the whole business", async () => {
      const res = await call("POST", "/me/compliance/owners", {
        ...NEW_OWNER,
        ownershipPercent: 41,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].message).toContain("40%");
      expect(beneficialOwner.create).not.toHaveBeenCalled();
    });

    it("stops at twenty people", async () => {
      beneficialOwner.count.mockResolvedValue(20);

      const res = await call("POST", "/me/compliance/owners", NEW_OWNER);

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("limit_reached");
    });

    it("leaves the person's own share out when checking an update", async () => {
      beneficialOwner.aggregate.mockResolvedValue({
        _sum: { ownershipPercent: 0 },
      });

      const res = await call(
        "PATCH",
        `/me/compliance/owners/${STORED_OWNER.id}`,
        { ownershipPercent: 100 },
      );

      expect(res.statusCode).toBe(200);
      expect(beneficialOwner.aggregate.mock.calls[0][0].where).toEqual({
        ownerId: USER_ID,
        id: { not: STORED_OWNER.id },
      });
      expect(beneficialOwner.updateMany.mock.calls[0][0].where).toEqual({
        id: STORED_OWNER.id,
        ownerId: USER_ID,
      });
    });

    it("cannot reach another account's person", async () => {
      beneficialOwner.updateMany.mockResolvedValue({ count: 0 });
      beneficialOwner.deleteMany.mockResolvedValue({ count: 0 });

      const update = await call("PATCH", "/me/compliance/owners/someone-else", {
        fullName: "Mallory",
      });
      const remove = await call("DELETE", "/me/compliance/owners/someone-else");

      expect(update.statusCode).toBe(404);
      expect(remove.statusCode).toBe(404);
    });

    it("removes a person", async () => {
      const res = await call(
        "DELETE",
        `/me/compliance/owners/${STORED_OWNER.id}`,
      );

      expect(res.statusCode).toBe(204);
      expect(beneficialOwner.deleteMany.mock.calls[0][0].where).toEqual({
        id: STORED_OWNER.id,
        ownerId: USER_ID,
      });
    });

    it("cannot change the list while it is under review", async () => {
      business.findUnique.mockResolvedValue({
        ...COMPLETE_BUSINESS,
        kybStatus: "PENDING",
      });

      const add = await call("POST", "/me/compliance/owners", NEW_OWNER);
      const remove = await call(
        "DELETE",
        `/me/compliance/owners/${STORED_OWNER.id}`,
      );

      expect(add.statusCode).toBe(409);
      expect(remove.statusCode).toBe(409);
      expect(beneficialOwner.create).not.toHaveBeenCalled();
      expect(beneficialOwner.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("POST /me/compliance/submit", () => {
    it("names every missing requirement instead of submitting", async () => {
      complianceProfile.findUnique.mockResolvedValue({
        ...COMPLETE_PROFILE,
        attestedBy: null,
      });
      beneficialOwner.findMany.mockResolvedValue([]);

      const res = await call("POST", "/me/compliance/submit");

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("incomplete");
      expect(res.json().issues.map((i: { path: string }) => i.path)).toEqual([
        "owners",
        "owners.control",
        "attestations",
      ]);
      expect($transaction).not.toHaveBeenCalled();
    });

    it("moves a complete business into review", async () => {
      const res = await call("POST", "/me/compliance/submit");

      expect(res.statusCode).toBe(200);
      expect(business.update.mock.calls[0][0]).toEqual({
        where: { ownerId: USER_ID },
        data: { kybStatus: "PENDING" },
      });
      expect(
        complianceProfile.update.mock.calls[0][0].data.submittedAt,
      ).toBeInstanceOf(Date);
    });

    it("resubmits after a rejection", async () => {
      business.findUnique.mockResolvedValue({
        ...COMPLETE_BUSINESS,
        kybStatus: "REJECTED",
      });

      const res = await call("POST", "/me/compliance/submit");

      expect(res.statusCode).toBe(200);
    });

    it.each([
      "PENDING",
      "VERIFIED",
    ])("does not submit twice once %s", async (kybStatus) => {
      business.findUnique.mockResolvedValue({
        ...COMPLETE_BUSINESS,
        kybStatus,
      });

      const res = await call("POST", "/me/compliance/submit");

      expect(res.statusCode).toBe(409);
      expect($transaction).not.toHaveBeenCalled();
    });
  });
});
