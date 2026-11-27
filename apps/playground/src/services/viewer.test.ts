import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, findUnique } = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("./db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/logger", () => ({ appLogger: { warn: vi.fn() } }));

const { getViewer } = await import("./viewer");

const ROW = {
  id: "019fce62-0000-7000-8000-000000000000",
  username: "ada",
  name: "Ada Lovelace",
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
  memberships: [
    { organizationId: "019fce62-0000-7000-8000-00000000000a" },
    { organizationId: "019fce62-0000-7000-8000-00000000000b" },
  ],
};

describe("getViewer", () => {
  beforeEach(() => {
    auth.mockReset();
    findUnique.mockReset();
    auth.mockResolvedValue({ userId: "user_123" });
  });

  it("resolves an active account, without its moderation flags", async () => {
    findUnique.mockResolvedValue(ROW);

    expect(await getViewer()).toEqual({
      id: ROW.id,
      username: "ada",
      name: "Ada Lovelace",
      avatarUrl: null,
      organizationIds: [
        "019fce62-0000-7000-8000-00000000000a",
        "019fce62-0000-7000-8000-00000000000b",
      ],
    });
  });

  it("loads only the memberships of live organizations", async () => {
    findUnique.mockResolvedValue({ ...ROW, memberships: [] });

    expect((await getViewer())?.organizationIds).toEqual([]);
    expect(findUnique.mock.calls[0][0].select.memberships).toEqual({
      where: { organization: { deletedAt: null } },
      select: { organizationId: true },
    });
  });

  it("treats a signed-out request as no viewer", async () => {
    auth.mockResolvedValue({ userId: null });

    expect(await getViewer()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("treats a banned, locked or deleted account as signed out", async () => {
    for (const flags of [
      { banned: true },
      { locked: true },
      { deletedAt: new Date("2026-09-01T00:00:00.000Z") },
    ]) {
      findUnique.mockResolvedValue({ ...ROW, ...flags });
      expect(await getViewer(), JSON.stringify(flags)).toBeNull();
    }
  });
});
