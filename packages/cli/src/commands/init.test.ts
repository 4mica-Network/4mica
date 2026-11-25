import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scaffold } from "../core/scaffold.js";
import { EXIT } from "../errors.js";
import { runCommand } from "../test/run.js";
import Init from "./init.js";

vi.mock("../core/scaffold.js", () => ({
  scaffold: vi.fn(async (init: Record<string, unknown>) => ({
    dir: "/tmp/project",
    name: init.name,
    template: "stub",
    packageManager: init.packageManager,
    installed: init.install,
    runScript: "dev",
    nextSteps: [{ done: true, step: "project created", command: "project" }],
    options: init,
  })),
}));
vi.mock("../core/runner.js", () => ({
  openBrowser: vi.fn(),
  runScript: vi.fn(),
}));

// Whatever runs these tests is not what launched the cli.
beforeEach(() => vi.stubEnv("npm_config_user_agent", undefined));
afterEach(() => vi.clearAllMocks());

// Vitest has no terminal on stdin, so every run here is one that cannot ask.
describe("init without a terminal", () => {
  it("refuses to guess the template", async () => {
    const { error } = await runCommand(Init, []);
    expect(error).toMatchObject({
      code: "TEMPLATE_REQUIRED",
      oclif: { exit: EXIT.usage },
    });
    expect(scaffold).not.toHaveBeenCalled();
  });

  it("fills every other answer with its default", async () => {
    await runCommand(Init, ["--template", "agent-buyer-node"]);
    expect(scaffold).toHaveBeenCalledWith(
      {
        type: "agent",
        agentRole: "buyer",
        framework: "express",
        name: "my-buyer-agent",
        packageManager: "pnpm",
        install: true,
        run: false,
        openDashboard: false,
      },
      false,
    );
  });

  it("installs with the package manager that launched it", async () => {
    vi.stubEnv("npm_config_user_agent", "npm/10.9.0 node/v22.11.0 linux x64");
    await runCommand(Init, ["--template", "seller-express"]);
    expect(scaffold).toHaveBeenCalledWith(
      expect.objectContaining({ packageManager: "npm" }),
      false,
    );
  });

  it("scaffolds whatever state the config file is in", async () => {
    const home = await mkdtemp(join(tmpdir(), "4mica-cli-"));
    await mkdir(join(home, "4mica"), { recursive: true });
    await writeFile(join(home, "4mica", "config.json"), "{ nope");
    const { error } = await runCommand(
      Init,
      ["--template", "seller-express"],
      home,
    );
    expect(error).toBeUndefined();
    expect(scaffold).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("scaffolds the default template with --yes", async () => {
    await runCommand(Init, ["app", "--yes", "--no-install", "--pm", "npm"]);
    expect(scaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: "app",
        type: "agent",
        agentRole: "seller",
        name: "my-seller-agent",
        packageManager: "npm",
        install: false,
      }),
      false,
    );
  });

  it("still accepts the flags --template replaced", async () => {
    await runCommand(Init, ["--type", "seller", "--framework", "express"]);
    expect(scaffold).toHaveBeenCalledWith(
      expect.objectContaining({ type: "seller", name: "my-seller-express" }),
      false,
    );
  });

  it("prints where the project is with --json", async () => {
    const { json } = await runCommand(Init, [
      "--template",
      "seller-express",
      "--json",
    ]);
    expect(json).toEqual({
      created: true,
      dir: "/tmp/project",
      name: "my-seller-express",
      template: "stub",
      packageManager: "pnpm",
      installed: true,
      runScript: "dev",
      nextSteps: [{ done: true, step: "project created", command: "project" }],
    });
  });

  it("takes the careful, spelled-out form: --no-run with --json", async () => {
    const { json, error } = await runCommand(Init, [
      "my app",
      "--template",
      "seller-express",
      "--no-install",
      "--no-run",
      "--no-dashboard",
      "--json",
    ]);
    expect(error).toBeUndefined();
    expect(json).toMatchObject({ created: true });
  });

  it("refuses --run with --json: the server would hold the JSON back", async () => {
    const { json } = await runCommand(Init, [
      "--template",
      "seller-express",
      "--run",
      "--json",
    ]);
    expect(json).toMatchObject({ error: { code: "RUN_WITH_JSON" } });
    expect(process.exitCode).toBe(EXIT.usage);
    process.exitCode = undefined;
    expect(scaffold).not.toHaveBeenCalled();
  });

  it("exits 2 with a code for a template that does not exist", async () => {
    const { error } = await runCommand(Init, ["--template", "bogus"]);
    expect(error).toMatchObject({ code: "BAD_FLAG_VALUE", oclif: { exit: 2 } });
  });
});
