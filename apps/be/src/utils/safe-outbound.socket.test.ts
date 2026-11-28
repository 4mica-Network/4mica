import { request } from "node:https";
import { type AddressInfo, createServer, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { pinnedLookup } from "./safe-outbound";

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
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;

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
