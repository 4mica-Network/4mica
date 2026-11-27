import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePlayground } = vi.hoisted(() => ({
  revalidatePlayground: vi.fn(async () => true),
}));

vi.mock("@services/playground", () => ({ revalidatePlayground }));

const { registerPlaygroundRevalidation, resourcesOf, revalidateOnWrite } =
  await import("./playground-revalidate");

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const AGENT_ID = "019fce62-1111-7000-8000-000000000000";

const settled = () => new Promise((resolve) => setImmediate(resolve));

const buildApp = async (signedIn = true): Promise<FastifyInstance> => {
  const app = Fastify();

  app.decorateRequest("user", null);
  registerPlaygroundRevalidation(app);

  app.addHook("onRequest", async (request) => {
    if (signedIn) {
      (request as unknown as { user: { id: string } }).user = { id: USER_ID };
    }
  });

  app.register((scope, _opts, done) => {
    scope.addHook("onResponse", revalidateOnWrite);

    scope.get("/me/agents/:id", async () => ({}));
    scope.patch("/me/agents/:id", async () => ({}));
    scope.post("/me/agents", async () => ({}));
    scope.put("/me/api-listings/:id/policy", async () => ({}));
    scope.delete("/me/agents/:id", async (_request, reply) =>
      reply.code(404).send({}),
    );
    scope.patch("/me/profile", async (request) => {
      request.staleUsernames = ["old-handle"];
      return {};
    });

    done();
  });

  app.patch("/me/notifications", async () => ({}));

  await app.ready();
  return app;
};

describe("resourcesOf", () => {
  it("maps agent and listing routes to their resource", () => {
    expect(resourcesOf("/me/agents/:id", { id: AGENT_ID })).toEqual([
      { kind: "agent", id: AGENT_ID },
    ]);
    expect(
      resourcesOf("/me/api-listings/:id/faqs/:faqId", { id: AGENT_ID }),
    ).toEqual([{ kind: "listing", id: AGENT_ID }]);
  });

  it("ignores routes without a resource id", () => {
    expect(resourcesOf("/me/agents", {})).toEqual([]);
    expect(resourcesOf("/me/wallets/:id", { id: AGENT_ID })).toEqual([]);
    expect(resourcesOf("/me/agents/batch-delete", {})).toEqual([]);
    expect(resourcesOf(undefined, { id: AGENT_ID })).toEqual([]);
  });
});

describe("revalidateOnWrite", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    revalidatePlayground.mockClear();
  });

  afterEach(async () => {
    await app.close();
  });

  it("names the owner and the resource after a successful write", async () => {
    app = await buildApp();

    await app.inject({ method: "PATCH", url: `/me/agents/${AGENT_ID}` });
    await settled();

    expect(revalidatePlayground).toHaveBeenCalledExactlyOnceWith({
      ownerId: USER_ID,
      resources: [{ kind: "agent", id: AGENT_ID }],
    });
  });

  it("sends only the owner when the route has no resource id", async () => {
    app = await buildApp();

    await app.inject({ method: "POST", url: "/me/agents" });
    await settled();

    expect(revalidatePlayground).toHaveBeenCalledExactlyOnceWith({
      ownerId: USER_ID,
    });
  });

  it("covers the trust routes nested under a listing", async () => {
    app = await buildApp();

    await app.inject({
      method: "PUT",
      url: `/me/api-listings/${AGENT_ID}/policy`,
    });
    await settled();

    expect(revalidatePlayground).toHaveBeenCalledExactlyOnceWith({
      ownerId: USER_ID,
      resources: [{ kind: "listing", id: AGENT_ID }],
    });
  });

  it("passes on the handle a rename left behind", async () => {
    app = await buildApp();

    await app.inject({ method: "PATCH", url: "/me/profile" });
    await settled();

    expect(revalidatePlayground).toHaveBeenCalledExactlyOnceWith({
      ownerId: USER_ID,
      usernames: ["old-handle"],
    });
  });

  it("stays silent on reads, failures and anonymous requests", async () => {
    app = await buildApp();

    await app.inject({ method: "GET", url: `/me/agents/${AGENT_ID}` });
    await app.inject({ method: "DELETE", url: `/me/agents/${AGENT_ID}` });
    await app.close();

    app = await buildApp(false);
    await app.inject({ method: "PATCH", url: `/me/agents/${AGENT_ID}` });
    await settled();

    expect(revalidatePlayground).not.toHaveBeenCalled();
  });

  it("does not fire on a route outside the hooked plugin", async () => {
    app = await buildApp();

    await app.inject({ method: "PATCH", url: "/me/notifications" });
    await settled();

    expect(revalidatePlayground).not.toHaveBeenCalled();
  });
});
