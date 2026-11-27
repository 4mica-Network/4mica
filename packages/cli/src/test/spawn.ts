import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { packageRoot } from "../core/package-root.js";

export const BIN = join(packageRoot, "bin", "run.js");

export interface Run {
  code: number | undefined;
  signal?: string;
  stdout: string;
  stderr: string;
  /** The temporary home and working directory it ran in. */
  home: string;
}

export interface SpawnOptions {
  env?: Record<string, string | undefined>;
  /** Reuse a home, when one run should see another's files. */
  home?: string;
  /**
   * Send it Ctrl-C at a moment the test names: when a promise resolves
   * (a server saw its request), or when its stderr matches. Never after a
   * delay: how long a command takes to get somewhere depends on the machine.
   */
  interruptWhen?: Promise<unknown> | RegExp;
  timeout?: number;
}

/**
 * Runs the built binary as a user would, in a fresh home with no
 * `FOURMICA_*` variables, no color, nothing on stdin, and the current
 * directory empty. What it prints is captured as it was written.
 */
export async function spawnCli(
  argv: string[],
  options: SpawnOptions = {},
): Promise<Run> {
  const home = options.home ?? (await mkdtemp(join(tmpdir(), "4mica-spawn-")));
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(FOURMICA|4MICA)_|_PROXY$|^DEBUG$|COLOR$/i.test(key)) continue;
    env[key] = value;
  }
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: home,
    LOCALAPPDATA: home,
    NO_COLOR: "1",
    FOURMICA_CREDENTIAL_STORE: "file",
    ...options.env,
  });
  // Node would pass `undefined` on as the string "undefined".
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key];
  }
  const child = execa("node", [BIN, ...argv], {
    cwd: home,
    env,
    extendEnv: false,
    reject: false,
    stdin: "ignore",
    timeout: options.timeout ?? 20_000,
  });
  const { interruptWhen } = options;
  if (interruptWhen instanceof RegExp) {
    let seen = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      seen += chunk.toString();
      if (interruptWhen.test(seen)) child.kill("SIGINT");
    });
  } else if (interruptWhen) {
    void interruptWhen.then(() => child.kill("SIGINT"));
  }
  const result = await child;
  return {
    code: result.exitCode,
    signal: result.signal,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
    home,
  };
}

/** A stand-in for core (or a seller) that records what it was asked. */
export interface MockServer {
  url: string;
  requests: { method: string; url: string }[];
  /** Resolves when the first request arrives. */
  requested: Promise<void>;
  close(): Promise<void>;
}

export async function mockServer(
  handle: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<MockServer> {
  const requests: MockServer["requests"] = [];
  let arrived = () => {};
  const requested = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const server: Server = createServer((req, res) => {
    requests.push({ method: req.method ?? "", url: req.url ?? "" });
    arrived();
    handle(req, res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    requested,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** The process boundary's one JSON promise: stdout is one document. */
export function parseJson(run: Run): unknown {
  return JSON.parse(run.stdout);
}
