import { request } from "node:https";
import {
  type AddressInfo,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OutboundAbortedError,
  pinnedLookup,
  postToPublicUrl,
} from "./safe-outbound";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  return { ...actual, lookup, default: { ...actual, lookup } };
});

vi.mock("@utils/public-host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@utils/public-host")>();
  return { ...actual, isPublicAddress: () => true };
});

const listen = async (server: Server): Promise<number> => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
};

describe("pinnedLookup on a real socket", () => {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.destroy();
  });

  afterEach(() => {
    server.close();
  });

  it("connects to the pinned address and never asks DNS for the hostname", async () => {
    const port = await listen(server);

    const error = await new Promise<Error>((resolve) => {
      const req = request({
        hostname: "pinned.invalid",
        port,
        method: "POST",
        servername: "pinned.invalid",
        agent: false,
        lookup: pinnedLookup({ address: "127.0.0.1", family: 4 }),
      });
      req.on("error", resolve);
      req.end();
    });

    expect(error.message).not.toMatch(/ENOTFOUND|EAI_AGAIN/);
    expect(sockets).toHaveLength(1);
  });
});

describe("postToPublicUrl against a server that never finishes TLS", () => {
  const POST = { headers: {}, body: "{}", timeoutMs: 300 };
  const closed: Promise<void>[] = [];
  const server = createServer((socket) => {
    closed.push(new Promise((resolve) => socket.on("close", resolve)));
    socket.resume();
  });

  afterEach(() => {
    closed.length = 0;
    server.close();
  });

  it("tears the socket down at the deadline", async () => {
    const port = await listen(server);
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const started = Date.now();

    await expect(
      postToPublicUrl(`https://tls-stall.example.com:${port}/`, POST),
    ).rejects.toMatchObject({ name: "TimeoutError", phase: "request" });

    expect(Date.now() - started).toBeLessThan(POST.timeoutMs + 500);
    expect(closed).toHaveLength(1);
    await closed[0];
  });

  it("tears the socket down when the caller cancels mid-handshake", async () => {
    const port = await listen(server);
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const caller = new AbortController();
    const connected = new Promise<void>((resolve) =>
      server.once("connection", () => resolve()),
    );

    const pending = postToPublicUrl(`https://tls-stall.example.com:${port}/`, {
      ...POST,
      timeoutMs: 60_000,
      signal: caller.signal,
    });
    await connected;
    caller.abort();

    await expect(pending).rejects.toBeInstanceOf(OutboundAbortedError);
    await closed[0];
  });
});
