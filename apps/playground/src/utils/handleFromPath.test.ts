import { describe, expect, it } from "vitest";
import { handleFromPath } from "./handleFromPath";

describe("handleFromPath", () => {
  it("reads a single well-formed segment as a handle", () => {
    expect(handleFromPath("/asdasda")).toBe("asdasda");
    expect(handleFromPath("/Ada_Lovelace")).toBe("ada_lovelace");
  });

  it("ignores anything deeper than a profile", () => {
    expect(handleFromPath("/ada/agents/atlas")).toBeNull();
    expect(handleFromPath("/")).toBeNull();
    expect(handleFromPath(null)).toBeNull();
  });

  it("never offers a reserved route or a blacklisted name", () => {
    expect(handleFromPath("/pricing")).toBeNull();
    expect(handleFromPath("/admin")).toBeNull();
  });

  it("never offers a malformed handle", () => {
    expect(handleFromPath("/a")).toBeNull();
    expect(handleFromPath("/has.dot")).toBeNull();
  });
});
