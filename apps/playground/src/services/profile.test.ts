import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, getViewer } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getViewer: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ prisma: { organization: { findFirst } } }));
vi.mock("./viewer", () => ({ getViewer }));
vi.mock("./cache", () => ({
  cachedPublic:
    <Args extends unknown[], Result>(
      _key: string,
      load: (...args: Args) => Promise<Result>,
    ) =>
    (...args: Args) =>
      load(...args),
}));

const { getAnonymousProfile, getPublicProfile } = await import("./profile");

const PERSONAL_ORG_ID = "019fce62-0000-7000-8000-00000000000a";
const TEAM_ORG_ID = "019fce62-0000-7000-8000-00000000000b";

const user = {
  id: "019fce62-0000-7000-8000-000000000001",
  username: "ada",
  name: "Ada Lovelace",
  bio: "Analytical engines",
  avatarUrl: "https://img.test/ada.png",
  verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  private: false,
  banned: false,
  deletedAt: null,
  allowSEOIndexing: true,
  allowEmailVisibility: false,
  allowPhoneNumberVisibility: false,
  email: null,
  emailVerified: false,
  phoneNumber: null,
  allowCustomBrandColor: false,
  primaryBrandColor: "",
  secondaryBrandColor: "",
  disableBranding: false,
  theme: "light",
};

const personalOrg = {
  id: PERSONAL_ORG_ID,
  handle: "ada",
  name: "Ada Lovelace",
  avatarUrl: null,
  personal: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
  memberships: [{ user }],
};

const teamOrg = {
  id: TEAM_ORG_ID,
  handle: "difference-labs",
  name: "Difference Labs",
  avatarUrl: "https://img.test/labs.png",
  personal: false,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  deletedAt: null,
  memberships: [{ user }],
};

const viewerIn = (...organizationIds: string[]) => ({
  id: "019fce62-0000-7000-8000-000000000002",
  username: "grace",
  name: "Grace",
  avatarUrl: null,
  organizationIds,
});

describe("getPublicProfile", () => {
  beforeEach(() => {
    findFirst.mockReset();
    getViewer.mockReset();
    getViewer.mockResolvedValue(null);
  });

  it("resolves a handle to a live organization", async () => {
    findFirst.mockResolvedValue(personalOrg);

    const result = await getPublicProfile("ada");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { handle: "ada", deletedAt: null } }),
    );
    expect(result?.organizationId).toBe(PERSONAL_ORG_ID);
  });

  it("keeps rendering a personal organization from its owner's profile", async () => {
    findFirst.mockResolvedValue(personalOrg);

    const profile = (await getPublicProfile("ada"))?.profile;

    expect(profile).toMatchObject({
      username: "ada",
      name: "Ada Lovelace",
      bio: "Analytical engines",
      avatarUrl: "https://img.test/ada.png",
      verified: true,
      theme: "light",
      isOwner: false,
      isPublished: true,
    });
  });

  it("hides a personal organization whose owner keeps the profile private", async () => {
    findFirst.mockResolvedValue({
      ...personalOrg,
      memberships: [{ user: { ...user, private: true } }],
    });

    expect(await getPublicProfile("ada")).toBeNull();
  });

  it("renders a team organization by its own name, avatar and handle", async () => {
    findFirst.mockResolvedValue(teamOrg);

    const result = await getAnonymousProfile("difference-labs");

    expect(result?.organizationId).toBe(TEAM_ORG_ID);
    expect(result?.profile).toMatchObject({
      username: "difference-labs",
      name: "Difference Labs",
      avatarUrl: "https://img.test/labs.png",
      bio: null,
      email: null,
      verified: false,
      memberSince: "2026-06-01T00:00:00.000Z",
      isOwner: false,
      isPublished: true,
    });
  });

  it("treats a member of the owning organization as its owner", async () => {
    findFirst.mockResolvedValue(teamOrg);
    getViewer.mockResolvedValue(viewerIn(PERSONAL_ORG_ID, TEAM_ORG_ID));

    const result = await getPublicProfile("difference-labs");

    expect(result?.profile.isOwner).toBe(true);
  });

  it("lets a member preview an unpublished profile", async () => {
    findFirst.mockResolvedValue({
      ...personalOrg,
      memberships: [{ user: { ...user, private: true } }],
    });
    getViewer.mockResolvedValue(viewerIn(PERSONAL_ORG_ID));

    const profile = (await getPublicProfile("ada"))?.profile;

    expect(profile?.isOwner).toBe(true);
    expect(profile?.isPublished).toBe(false);
  });

  it("does not treat a non-member as the owner", async () => {
    findFirst.mockResolvedValue(teamOrg);
    getViewer.mockResolvedValue(viewerIn(PERSONAL_ORG_ID));

    expect((await getPublicProfile("difference-labs"))?.profile.isOwner).toBe(
      false,
    );
  });

  it("returns nothing for an unknown or deleted handle", async () => {
    findFirst.mockResolvedValue(null);

    expect(await getPublicProfile("ghost")).toBeNull();
  });
});
