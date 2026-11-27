import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACME_CHECKOUT,
  ACME_ORG,
  type MockPlatform,
  mockPlatform,
  PERSONAL_ORG,
} from "../../test/platform.js";
import { runCommand } from "../../test/run.js";
import { pinJson } from "../../test/shape.js";
import Account from "../account.js";
import AuthLogin from "../auth/login.js";
import AuthStatus from "../auth/status.js";
import EnvUse from "../env/use.js";
import Projects from "../projects/index.js";
import ProjectsUse from "../projects/use.js";
import Whoami from "../whoami.js";
import Orgs from "./index.js";
import OrgsUse from "./use.js";

const { openBrowser } = vi.hoisted(() => ({
  openBrowser: vi.fn(async () => {}),
}));

vi.mock("../../core/runner.js", () => ({ openBrowser }));

vi.setConfig({ testTimeout: 30_000 });

const TOKEN = "4mica_cli_for-the-workspace";

let home: string;
let platform: MockPlatform;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "4mica-cli-"));
  platform = await mockPlatform();
  platform.tokens.add(TOKEN);
});

afterEach(async () => {
  await platform.close();
});

const run = (
  command: Parameters<typeof runCommand>[0],
  argv: string[] = [],
  env: Record<string, string> = {},
) =>
  runCommand(command, argv, home, {
    FOURMICA_API_URL: platform.url,
    FOURMICA_TOKEN: TOKEN,
    ...env,
  });

const sent = (route: string) =>
  platform.contexts.filter((context) => context.route === route).at(-1);

const savedContext = async () =>
  JSON.parse(await readFile(join(home, "4mica", "config.json"), "utf8"))
    .context;

describe("orgs", () => {
  it("lists the organizations, marking the default one in use", async () => {
    const { json, stdout } = await run(Orgs, ["--json"]);

    expect(json).toEqual([
      expect.objectContaining({ handle: "ada", active: true }),
      expect.objectContaining({ handle: "acme", active: false }),
    ]);
    expect(stdout).not.toContain(TOKEN);
    pinJson("orgs", json);
  });

  it("switches to an organization by handle, and acts in it from then on", async () => {
    const { json } = await run(OrgsUse, ["ACME", "--json"]);
    expect(json).toMatchObject({ id: ACME_ORG, active: true });
    pinJson("orgs use", json);
    expect(await savedContext()).toEqual({
      org: { id: ACME_ORG, handle: "acme", name: "Acme" },
    });

    const listed = await run(Orgs, ["--json"]);
    expect(
      (listed.json as { handle: string; active: boolean }[]).find(
        (org) => org.active,
      )?.handle,
    ).toBe("acme");

    await run(Projects, ["--json"]);
    expect(sent("GET /me/projects")?.org).toBe(ACME_ORG);
  });

  it("refuses an organization the account is not in", async () => {
    const { error } = await run(OrgsUse, ["globex"]);

    expect(error).toMatchObject({ code: "UNKNOWN_ORGANIZATION" });
    await expect(savedContext()).rejects.toThrow();
  });
});

describe("projects", () => {
  it("lists the projects in the organization in use", async () => {
    await run(OrgsUse, ["acme"]);
    const { json } = await run(Projects, ["--json"]);

    expect(json).toEqual([
      expect.objectContaining({ slug: "default", active: true }),
      expect.objectContaining({ slug: "checkout", active: false }),
    ]);
    pinJson("projects", json);
  });

  it("switches project, and sends it with every request", async () => {
    await run(OrgsUse, ["acme"]);
    const { json } = await run(ProjectsUse, ["checkout", "--json"]);
    expect(json).toMatchObject({ id: ACME_CHECKOUT, active: true });
    pinJson("projects use", json);

    await run(Account, ["--json"]);
    expect(sent("GET /me/wallets")).toMatchObject({
      org: ACME_ORG,
      project: ACME_CHECKOUT,
    });
  });

  it("goes back to the default project when the organization changes", async () => {
    await run(OrgsUse, ["acme"]);
    await run(ProjectsUse, ["checkout"]);
    const { stderr } = await run(OrgsUse, ["ada"]);

    expect(stderr).toContain("default project");
    expect((await savedContext()).project).toBeUndefined();
  });

  it("refuses a project that is not in the organization", async () => {
    const { error } = await run(ProjectsUse, ["checkout"]);

    expect(error).toMatchObject({ code: "UNKNOWN_PROJECT" });
  });
});

describe("env use", () => {
  it("saves the environment and sends it with every request", async () => {
    const { json } = await run(EnvUse, ["Production", "--json"]);
    expect(json).toEqual({ environment: "production" });
    pinJson("env use", json);

    await run(Account, []);
    expect(sent("GET /me/wallets")?.environment).toBe("production");
  });

  it("refuses an environment it does not know", async () => {
    const { error } = await run(EnvUse, ["staging"]);

    expect(error).toMatchObject({ code: "UNKNOWN_ENVIRONMENT" });
  });

  it("sends no environment until one is chosen", async () => {
    await run(Account, []);

    expect(sent("GET /me/wallets")).toMatchObject({
      org: undefined,
      project: undefined,
      environment: undefined,
    });
  });
});

describe("choosing for one run", () => {
  it("takes --org, --project and --env ahead of what is saved", async () => {
    await run(EnvUse, ["sandbox"]);
    await run(Account, [
      "--org",
      "acme",
      "--project",
      "checkout",
      "--env",
      "production",
    ]);

    expect(sent("GET /me/wallets")).toEqual({
      route: "GET /me/wallets",
      org: ACME_ORG,
      project: ACME_CHECKOUT,
      environment: "production",
    });
    expect(await savedContext()).toEqual({ environment: "sandbox" });
  });

  it("takes FOURMICA_ORG, FOURMICA_PROJECT and FOURMICA_ENV", async () => {
    await run(Account, [], {
      FOURMICA_ORG: ACME_ORG,
      FOURMICA_PROJECT: "checkout",
      FOURMICA_ENV: "production",
    });

    expect(sent("GET /me/wallets")).toMatchObject({
      org: ACME_ORG,
      project: ACME_CHECKOUT,
      environment: "production",
    });
  });

  it("refuses an unknown --env before any request", async () => {
    const { error } = await run(Account, ["--env", "staging"]);

    expect(error).toMatchObject({ code: "UNKNOWN_ENVIRONMENT" });
    expect(platform.requests).toEqual([]);
  });
});

describe("what is in use", () => {
  it("is shown by auth status, with where each choice came from", async () => {
    await run(OrgsUse, ["acme"]);
    const status = await run(AuthStatus, ["--json"], {
      FOURMICA_ENV: "production",
    });
    expect(status.json).toMatchObject({
      context: {
        organization: { id: ACME_ORG, name: "acme", source: "config" },
        project: { id: null, name: null, source: "default" },
        environment: { name: "production", source: "env" },
      },
    });

    const shown = await run(AuthStatus, []);
    expect(shown.stdout).toContain("acme (from the config file)");
    expect(shown.stdout).toContain("sandbox (default)");
  });

  it("is shown by whoami without asking the platform", async () => {
    await run(OrgsUse, ["acme"]);
    const before = platform.requests.length;
    const { stdout } = await runCommand(Whoami, [], home, {
      FOURMICA_WALLET_PRIVATE_KEY: `0x${"1".repeat(64)}`,
      FOURMICA_ENV: "production",
    });

    expect(stdout).toContain("acme (from the config file)");
    expect(stdout).toContain("production (from the environment)");
    expect(platform.requests.length).toBe(before);
  });
});

describe("auth login --org", () => {
  const login = (argv: string[]) =>
    runCommand(AuthLogin, ["--no-open", ...argv], home, {
      FOURMICA_API_URL: platform.url,
    });

  it("asks for a session limited to the organization, and acts in it", async () => {
    const { json, error } = await login(["--org", "acme", "--json"]);

    expect(error).toBeUndefined();
    expect(platform.organization).toBe("acme");
    expect(json).toMatchObject({
      organization: { id: ACME_ORG, handle: "acme" },
    });
    expect((await savedContext()).org).toMatchObject({ id: ACME_ORG });

    const status = await runCommand(AuthStatus, [], home, {
      FOURMICA_API_URL: platform.url,
    });
    expect(status.stdout).toContain("acme (the session is limited to it)");
  });

  it("asks for no organization without --org", async () => {
    await login([]);

    expect(platform.organization).toBeUndefined();
    await expect(savedContext()).rejects.toThrow();
  });

  it("warns when another organization is chosen for a limited session", async () => {
    await login(["--org", "acme"]);
    const { stderr } = await runCommand(
      AuthStatus,
      ["--org", PERSONAL_ORG],
      home,
      { FOURMICA_API_URL: platform.url },
    );

    expect(stderr).toContain("limited to acme");
  });
});
