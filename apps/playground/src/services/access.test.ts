import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    apiListing: { findFirst: vi.fn(), findMany: vi.fn() },
    agent: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (load: unknown) => load,
}));
vi.mock("./db", () => ({ prisma }));

const { getPublicApiListing, listPublicApiListings } = await import(
  "./api-listings"
);
const { getPublicAgent, listPublicAgents } = await import("./agents");
const { listDirectory } = await import("./directory");
const { PAYABLE_AGENT, PAYABLE_LISTING } = await import("./payable");

const OWNER = "019fce62-0000-7000-8000-000000000001";

const whereOf = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;

beforeEach(() => {
  for (const model of [prisma.apiListing, prisma.agent]) {
    model.findFirst.mockReset().mockResolvedValue(null);
    model.findMany.mockReset().mockResolvedValue([]);
  }
});

describe.each([
  {
    kind: "listing",
    model: prisma.apiListing,
    complete: PAYABLE_LISTING,
    one: getPublicApiListing,
    list: listPublicApiListings,
  },
  {
    kind: "agent",
    model: prisma.agent,
    complete: PAYABLE_AGENT,
    one: getPublicAgent,
    list: listPublicAgents,
  },
])("$kind access", ({ model, complete, one, list }) => {
  it("lets a direct link reach only complete public or unlisted rows", async () => {
    await one(OWNER, "by-link", false);

    expect(whereOf(model.findFirst)).toMatchObject({
      ownerId: OWNER,
      visibility: { in: ["PUBLIC", "UNLISTED"] },
      ...complete,
    });
  });

  it("lists only complete public rows on the profile", async () => {
    await list(OWNER, false);

    expect(whereOf(model.findMany)).toMatchObject({
      ownerId: OWNER,
      visibility: "PUBLIC",
      ...complete,
    });
  });

  it("shows the owner every row, complete or not", async () => {
    await one(OWNER, "mine", true);
    await list(OWNER, true);

    for (const where of [whereOf(model.findFirst), whereOf(model.findMany)]) {
      expect(where).not.toHaveProperty("visibility");
      for (const field of Object.keys(complete)) {
        expect(where).not.toHaveProperty(field);
      }
    }
  });
});

describe("directory", () => {
  it("indexes only complete public rows", async () => {
    await listDirectory();

    expect(whereOf(prisma.apiListing.findMany)).toMatchObject({
      visibility: "PUBLIC",
      ...PAYABLE_LISTING,
    });
    expect(whereOf(prisma.agent.findMany)).toMatchObject({
      visibility: "PUBLIC",
      ...PAYABLE_AGENT,
    });
  });
});
