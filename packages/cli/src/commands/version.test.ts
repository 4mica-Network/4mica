import { describe, expect, it } from "vitest";
import { runCommand } from "../test/run.js";
import { pinJson } from "../test/shape.js";
import Version from "./version.js";

describe("version", () => {
  it("names the version, Node and the platform", async () => {
    const { json } = await runCommand(Version, ["--json"]);
    pinJson("version", json);
    expect(json).toEqual({
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    });
  });
});
