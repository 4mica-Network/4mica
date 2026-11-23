export interface ServiceWorkerConfig {
  version: string;
  shell: string[];
  fallback: string;
  runtimeLimit: number;
}

interface WorkerCache {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
  addAll(requests: Request[]): Promise<void>;
  keys(): Promise<readonly Request[]>;
  delete(request: Request | string): Promise<boolean>;
}

interface WorkerCaches {
  open(name: string): Promise<WorkerCache>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
  match(request: Request | string): Promise<Response | undefined>;
}

export interface WorkerEvent {
  request: Request;
  waitUntil(task: Promise<unknown>): void;
  respondWith(response: Promise<Response>): void;
}

export interface WorkerScope {
  location: { origin: string };
  caches: WorkerCaches;
  fetch(request: Request | string): Promise<Response>;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(
    type: "install" | "activate" | "fetch",
    listener: (event: WorkerEvent) => void,
  ): void;
}

export function serviceWorker(config: ServiceWorkerConfig, scope: WorkerScope) {
  const SHELL_PREFIX = "4mica-shell-";
  const SHELL = `${SHELL_PREFIX}${config.version}`;
  const RUNTIME = "4mica-assets";

  const fromCache = (request: Request | string) => scope.caches.match(request);

  const trimRuntime = async () => {
    const cache = await scope.caches.open(RUNTIME);
    const keys = await cache.keys();
    const excess = keys.length - config.runtimeLimit;
    for (const key of keys.slice(0, Math.max(0, excess))) {
      await cache.delete(key);
    }
  };

  const asset = async (request: Request): Promise<Response> => {
    const cached = await fromCache(request);
    if (cached) {
      return cached;
    }
    const response = await scope.fetch(request);
    if (response.ok) {
      const cache = await scope.caches.open(RUNTIME);
      await cache.put(request, response.clone());
      await trimRuntime();
    }
    return response;
  };

  const page = async (request: Request): Promise<Response> => {
    try {
      return await scope.fetch(request);
    } catch (error) {
      const shell = await fromCache(config.fallback);
      if (shell) {
        return shell;
      }
      throw error;
    }
  };

  const shellFile = async (request: Request): Promise<Response> => {
    try {
      return await scope.fetch(request);
    } catch (error) {
      const cached = await fromCache(request);
      if (cached) {
        return cached;
      }
      throw error;
    }
  };

  scope.addEventListener("install", (event) => {
    event.waitUntil(
      scope.caches
        .open(SHELL)
        .then((cache) =>
          cache.addAll(
            config.shell.map(
              (url) =>
                new Request(new URL(url, scope.location.origin).href, {
                  cache: "reload",
                }),
            ),
          ),
        )
        .then(() => scope.skipWaiting()),
    );
  });

  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      scope.caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => name.startsWith(SHELL_PREFIX) && name !== SHELL)
              .map((name) => scope.caches.delete(name)),
          ),
        )
        .then(() => scope.clients.claim()),
    );
  });

  scope.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") {
      return;
    }
    const url = new URL(request.url);
    if (url.origin !== scope.location.origin) {
      return;
    }
    if (request.mode === "navigate") {
      event.respondWith(page(request));
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(asset(request));
      return;
    }
    if (config.shell.includes(url.pathname)) {
      event.respondWith(shellFile(request));
    }
  });
}
