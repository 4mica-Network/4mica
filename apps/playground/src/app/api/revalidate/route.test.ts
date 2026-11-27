import { beforeEach, describe, expect, it, vi } from "vitest";

const { env, findUnique, revalidatePath, revalidateTag } = vi.hoisted(() => ({
  env: { REVALIDATE_SECRET: "" },
  findUnique: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("@/env.server", () => ({ serverEnv: () => env }));
vi.mock("@/services/db", () => ({ prisma: { organization: { findUnique } } }));

const { NextRequest } = await import("next/server");
const { POST } = await import("./route");

const SECRET = "s".repeat(32);
const ORG_ID = "019fce62-0000-7000-8000-000000000000";
const AGENT_ID = "019fce62-1111-7000-8000-000000000000";

const send = (body: unknown, token: string = SECRET) =>
  POST(
    new NextRequest("http://playground.test/api/revalidate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const tags = () => revalidateTag.mock.calls.map(([tag]) => tag);
const paths = () => revalidatePath.mock.calls.map(([path]) => path);

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    env.REVALIDATE_SECRET = SECRET;
    findUnique.mockReset();
    revalidatePath.mockReset();
    revalidateTag.mockReset();
  });

  it("does not exist while no secret is configured", async () => {
    env.REVALIDATE_SECRET = "";

    expect((await send({ organizationId: ORG_ID })).status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a wrong token", async () => {
    expect(
      (await send({ organizationId: ORG_ID }, "x".repeat(32))).status,
    ).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a body that names nothing to revalidate", async () => {
    const bodies = [
      "not json",
      {},
      { resources: [] },
      { organizationId: "not an id" },
      { username: "!!" },
      { usernames: ["!!"] },
    ];

    for (const body of bodies) {
      const response = await send(body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_body" });
    }

    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("clears the organization, its current handle, a stale handle and a resource", async () => {
    findUnique.mockResolvedValue({ id: ORG_ID, handle: "ada" });

    const response = await send({
      organizationId: ORG_ID,
      usernames: ["old-ada"],
      resources: [{ kind: "agent", id: AGENT_ID }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      revalidated: true,
      usernames: ["old-ada", "ada"],
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ORG_ID } }),
    );
    expect(tags()).toEqual([
      `organization:${ORG_ID}`,
      "profile:old-ada",
      "profile:ada",
      `resource:agent:${AGENT_ID}`,
    ]);
    expect(paths()).toEqual(["/old-ada", "/ada"]);
    expect(revalidateTag).toHaveBeenCalledWith(`organization:${ORG_ID}`, {
      expire: 0,
    });
  });

  it("skips a stale handle it cannot parse instead of refusing the call", async () => {
    findUnique.mockResolvedValue({ id: ORG_ID, handle: "ada" });

    const response = await send({
      organizationId: ORG_ID,
      usernames: ["Old.Name!", "old-ada"],
      resources: [{ kind: "listing", id: "legacy-1" }],
    });

    expect(response.status).toBe(200);
    expect(tags()).toEqual([
      `organization:${ORG_ID}`,
      "profile:old-ada",
      "profile:ada",
      "resource:listing:legacy-1",
    ]);
  });

  it("still clears the organization tag when it is gone", async () => {
    findUnique.mockResolvedValue(null);

    expect((await send({ organizationId: ORG_ID })).status).toBe(200);
    expect(tags()).toEqual([`organization:${ORG_ID}`]);
    expect(paths()).toEqual([]);
  });

  it("keeps accepting a bare username", async () => {
    findUnique.mockResolvedValue({ id: ORG_ID, handle: "ada" });

    const response = await send({ username: "@Ada" });

    expect(await response.json()).toEqual({
      revalidated: true,
      usernames: ["ada"],
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { handle: "ada" } }),
    );
    expect(tags()).toEqual([`organization:${ORG_ID}`, "profile:ada"]);
    expect(paths()).toEqual(["/ada"]);
  });

  it("clears a handle nobody owns any more", async () => {
    findUnique.mockResolvedValue(null);

    expect((await send({ username: "ghost" })).status).toBe(200);
    expect(tags()).toEqual(["profile:ghost"]);
  });
});
