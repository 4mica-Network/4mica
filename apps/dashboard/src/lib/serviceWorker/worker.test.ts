import { describe, expect, it, vi } from "vitest";
import { serviceWorkerSource } from "./plugin";
import {
  type ServiceWorkerConfig,
  serviceWorker,
  type WorkerEvent,
  type WorkerScope,
} from "./worker";

const ORIGIN = "https://app.4mica.io";

const CONFIG: ServiceWorkerConfig = {
  version: "v2",
  shell: [
    "/index.html",
    "/assets/index-abc.js",
    "/assets/index-abc.css",
    "/theme-init.js",
  ],
  fallback: "/index.html",
  runtimeLimit: 3,
};

const keyOf = (request: Request | string) =>
  new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname;

const makeScope = () => {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    let store = stores.get(name);
    if (!store) {
      store = new Map();
      stores.set(name, store);
    }
    const entries = store;
    return {
      match: async (request: Request | string) =>
        entries.get(keyOf(request))?.clone(),
      put: async (request: Request | string, response: Response) => {
        entries.set(keyOf(request), response);
      },
      addAll: async (requests: Request[]) => {
        for (const request of requests) {
          const response = await scope.fetch(request);
          entries.set(keyOf(request), response);
        }
      },
      keys: async () =>
        [...entries.keys()].map((path) => new Request(`${ORIGIN}${path}`)),
      delete: async (request: Request | string) =>
        entries.delete(keyOf(request)),
    };
  };

  let online = true;
  const network = new Map<string, () => Response>([
    ["/index.html", () => new Response("<html>shell v2</html>")],
    ["/", () => new Response("<html>shell v2</html>")],
    ["/assets/index-abc.js", () => new Response("entry")],
    ["/assets/index-abc.css", () => new Response("css")],
    ["/theme-init.js", () => new Response("theme")],
    ["/assets/wallet-1.js", () => new Response("wallet page")],
  ]);
  const fetched: string[] = [];
  const fetch = vi.fn(async (request: Request | string) => {
    const path = keyOf(request);
    fetched.push(path);
    if (!online) {
      throw new TypeError("Failed to fetch");
    }
    const make = network.get(path);
    return make ? make() : new Response("missing", { status: 404 });
  });

  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const scope: WorkerScope & { fetch: typeof fetch } = {
    location: { origin: ORIGIN },
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (request: Request | string) => {
        for (const store of stores.values()) {
          const hit = store.get(keyOf(request));
          if (hit) {
            return hit.clone();
          }
        }
        return undefined;
      },
    },
    fetch,
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    addEventListener: (type, listener) => {
      listeners.set(type, listener);
    },
  };

  const lifecycle = async (type: "install" | "activate") => {
    let task: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({
      request: new Request(ORIGIN),
      waitUntil: (work) => {
        task = work;
      },
      respondWith: () => {},
    });
    await task;
  };

  const request = async (
    path: string,
    init: { mode?: RequestMode; method?: string; origin?: string } = {},
  ): Promise<Response | null> => {
    const target = new Request(`${init.origin ?? ORIGIN}${path}`, {
      method: init.method ?? "GET",
    });
    const req = init.mode
      ? new Proxy(target, {
          get: (obj, prop) =>
            prop === "mode" ? init.mode : Reflect.get(obj, prop, obj),
        })
      : target;
    let response: Promise<Response> | null = null;
    listeners.get("fetch")?.({
      request: req,
      waitUntil: () => {},
      respondWith: (value) => {
        response = value;
      },
    });
    return response;
  };

  return {
    scope,
    stores,
    fetched,
    lifecycle,
    request,
    goOffline: () => {
      online = false;
    },
  };
};

const install = () => {
  const env = makeScope();
  serviceWorker(CONFIG, env.scope);
  return env;
};

describe("service worker", () => {
  it("caches the app shell on install, bypassing the HTTP cache, then takes over", async () => {
    const env = install();
    const reloads: RequestCache[] = [];
    env.scope.fetch.mockImplementation(async (request: Request | string) => {
      if (typeof request !== "string") {
        reloads.push(request.cache);
      }
      return new Response("ok");
    });

    await env.lifecycle("install");

    expect([...(env.stores.get("4mica-shell-v2")?.keys() ?? [])]).toEqual(
      CONFIG.shell,
    );
    expect(reloads.every((mode) => mode === "reload")).toBe(true);
    expect(env.scope.skipWaiting).toHaveBeenCalled();
  });

  it("drops older shells on activate but keeps cached pages", async () => {
    const env = install();
    await env.scope.caches.open("4mica-shell-v1");
    await env.scope.caches.open("4mica-assets");
    await env.lifecycle("install");

    await env.lifecycle("activate");

    expect([...env.stores.keys()].sort()).toEqual([
      "4mica-assets",
      "4mica-shell-v2",
    ]);
    expect(env.scope.clients.claim).toHaveBeenCalled();
  });

  it("serves pages from the network while online", async () => {
    const env = install();
    await env.lifecycle("install");

    const response = await env.request("/wallet", { mode: "navigate" });

    expect(await response?.text()).toBe("missing");
    expect(env.fetched.at(-1)).toBe("/wallet");
  });

  it("opens the cached app shell for any page while offline", async () => {
    const env = install();
    await env.lifecycle("install");
    env.goOffline();

    const response = await env.request("/customers/42", { mode: "navigate" });

    expect(await response?.text()).toBe("<html>shell v2</html>");
  });

  it("fails a page offline when there is no shell to fall back on", async () => {
    const env = install();
    env.goOffline();

    await expect(env.request("/wallet", { mode: "navigate" })).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("serves hashed assets from the cache first and caches pages as they are opened", async () => {
    const env = install();
    await env.lifecycle("install");

    const first = await env.request("/assets/wallet-1.js");
    env.goOffline();
    const again = await env.request("/assets/wallet-1.js");
    const entry = await env.request("/assets/index-abc.js");

    expect(await first?.text()).toBe("wallet page");
    expect(await again?.text()).toBe("wallet page");
    expect(await entry?.text()).toBe("entry");
    expect(
      env.fetched.filter((path) => path === "/assets/wallet-1.js"),
    ).toEqual(["/assets/wallet-1.js"]);
  });

  it("does not cache a failed asset response", async () => {
    const env = install();

    const response = await env.request("/assets/gone-1.js");

    expect(response?.status).toBe(404);
    expect(
      env.stores.get("4mica-assets")?.has("/assets/gone-1.js"),
    ).toBeFalsy();
  });

  it("keeps the page cache within its limit, dropping the oldest", async () => {
    const env = install();
    env.scope.fetch.mockImplementation(async () => new Response("chunk"));

    for (const name of ["a", "b", "c", "d", "e"]) {
      await env.request(`/assets/${name}-1.js`);
    }

    expect([...(env.stores.get("4mica-assets")?.keys() ?? [])]).toEqual([
      "/assets/c-1.js",
      "/assets/d-1.js",
      "/assets/e-1.js",
    ]);
  });

  it("refreshes shell files from the network and falls back to the cache offline", async () => {
    const env = install();
    await env.lifecycle("install");

    expect(await (await env.request("/theme-init.js"))?.text()).toBe("theme");
    env.goOffline();
    expect(await (await env.request("/theme-init.js"))?.text()).toBe("theme");
  });

  it("leaves API calls, other origins and writes to the network", async () => {
    const env = install();

    expect(
      await env.request("/v1/me", { origin: "https://api.app.4mica.io" }),
    ).toBeNull();
    expect(await env.request("/assets/a-1.js", { method: "POST" })).toBeNull();
    expect(await env.request("/healthz")).toBeNull();
  });

  it("runs as the standalone script the build emits", async () => {
    const env = makeScope();
    new Function("self", serviceWorkerSource(CONFIG))(env.scope);
    await env.lifecycle("install");
    env.goOffline();

    const response = await env.request("/settings/profile", {
      mode: "navigate",
    });

    expect(await response?.text()).toBe("<html>shell v2</html>");
  });
});
