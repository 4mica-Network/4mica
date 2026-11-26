import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { routeThroughEnvProxy } from "./net.js";

/** A target, and a proxy that counts what it tunnels (as for https). */
let target: Server;
let proxy: Server;
let tunnelled = 0;
const port = (server: Server) => (server.address() as AddressInfo).port;
const dispatcher = getGlobalDispatcher();
const saved = { ...process.env };

beforeAll(async () => {
  target = createServer((_req, res) => res.end("hello")).listen(0);
  proxy = createServer().listen(0);
  proxy.on("connect", (req, socket, head) => {
    tunnelled++;
    const [host, p] = (req.url ?? "").split(":");
    const upstream = connect(Number(p), host, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
  });
  await Promise.all([once(target, "listening"), once(proxy, "listening")]);
});
afterAll(() => {
  setGlobalDispatcher(dispatcher);
  process.env = saved;
  target.close();
  proxy.close();
});

describe("HTTP_PROXY and NO_PROXY", () => {
  it("sends requests through the proxy, except to hosts NO_PROXY names", async () => {
    process.env.HTTP_PROXY = `http://127.0.0.1:${port(proxy)}`;
    process.env.NO_PROXY = "localhost";
    expect(await routeThroughEnvProxy(process.env)).toBe(true);

    const through = await fetch(`http://127.0.0.1:${port(target)}/`);
    expect(await through.text()).toBe("hello");
    expect(tunnelled).toBe(1);

    const direct = await fetch(`http://localhost:${port(target)}/`);
    expect(await direct.text()).toBe("hello");
    expect(tunnelled).toBe(1);
  });
});
