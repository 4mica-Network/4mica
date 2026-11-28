import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { settings, warn } = vi.hoisted(() => ({
  settings: {
    playground: undefined as { url: string; secret: string } | undefined,
  },
  warn: vi.fn(),
}));

vi.mock("@config/index", () => ({ config: settings }));
vi.mock("@logger/index", () => ({
  createScopedLogger: () => ({ warn }),
}));

const { revalidatePlayground } = await import("./playground");

const ORGANIZATION_ID = "019fce62-0000-7000-8000-000000000000";
const TARGET = {
  url: "http://4mica-playground:3100",
  secret: "s".repeat(32),
};

describe("revalidatePlayground", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    warn.mockReset();
    settings.playground = TARGET;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when the playground is not configured", async () => {
    settings.playground = undefined;

    expect(
      await revalidatePlayground({ organizationId: ORGANIZATION_ID }),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the payload with the bearer secret", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    const payload = {
      organizationId: ORGANIZATION_ID,
      usernames: ["ada"],
      resources: [{ kind: "agent" as const, id: ORGANIZATION_ID }],
    };

    expect(await revalidatePlayground(payload)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://4mica-playground:3100/api/revalidate");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${TARGET.secret}`);
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a refusal without throwing", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));

    expect(
      await revalidatePlayground({ organizationId: ORGANIZATION_ID }),
    ).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("refused"),
      expect.objectContaining({ status: 401, organizationId: ORGANIZATION_ID }),
    );
  });

  it("reports an unreachable playground without throwing", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", {
        cause: new Error("connect ECONNREFUSED 127.0.0.1:3100"),
      }),
    );

    expect(
      await revalidatePlayground({ organizationId: ORGANIZATION_ID }),
    ).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not reach"),
      {
        reason: "fetch failed: connect ECONNREFUSED 127.0.0.1:3100",
        organizationId: ORGANIZATION_ID,
      },
    );
  });
});
