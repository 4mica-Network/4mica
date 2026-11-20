import { afterEach, describe, expect, it, vi } from "vitest";
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
      dir: "/tmp/project",
      name: "my-seller-express",
      template: "stub",
      packageManager: "pnpm",
      installed: true,
      runScript: "dev",
      nextSteps: [{ done: true, step: "project created", command: "project" }],
    });
  });
});
