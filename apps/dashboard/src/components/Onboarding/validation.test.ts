import { describe, expect, it } from "vitest";
import {
  isBusinessValid,
  isNameValid,
  isUsernameShapeValid,
  isUsernameValid,
} from "./validation";

describe("onboarding name validation", () => {
  it("requires at least two characters after trimming", () => {
    expect(isNameValid("a")).toBe(false);
    expect(isNameValid("  a  ")).toBe(false);
    expect(isNameValid("Ada")).toBe(true);
  });

  it("rejects whitespace-only input", () => {
    expect(isNameValid("     ")).toBe(false);
  });

  it("matches the server's 120-character ceiling", () => {
    expect(isNameValid("a".repeat(120))).toBe(true);
    expect(isNameValid("a".repeat(121))).toBe(false);
  });
});

describe("onboarding username shape", () => {
  it("accepts the documented character class", () => {
    expect(isUsernameShapeValid("ada-lovelace_1")).toBe(true);
  });

  it("normalises case before judging", () => {
    // The server lowercases on write, so "AdaLovelace" is a valid submission.
    expect(isUsernameShapeValid("AdaLovelace")).toBe(true);
  });

  it("rejects spaces and punctuation", () => {
    expect(isUsernameShapeValid("Not Valid!")).toBe(false);
    expect(isUsernameShapeValid("ada.lovelace")).toBe(false);
  });

  it("rejects handles outside the length bounds", () => {
    expect(isUsernameShapeValid("a")).toBe(false);
    expect(isUsernameShapeValid("a".repeat(65))).toBe(false);
  });

  it("rejects segments the marketing site owns", () => {
    // Public profiles are served bare off the same apex domain, so these would
    // shadow real pages.
    expect(isUsernameShapeValid("pricing")).toBe(false);
    expect(isUsernameShapeValid("docs")).toBe(false);
    expect(isUsernameShapeValid("Blog")).toBe(false);
  });
});

describe("onboarding username gating", () => {
  it("blocks while a check is in flight", () => {
    expect(isUsernameValid("ada", "checking")).toBe(false);
  });

  it("blocks a handle the server said is unavailable", () => {
    expect(isUsernameValid("ada", "taken")).toBe(false);
    expect(isUsernameValid("ada", "reserved")).toBe(false);
  });

  it("allows submission once a handle is confirmed free", () => {
    expect(isUsernameValid("ada", "available")).toBe(true);
  });

  it("still allows submission when the probe itself failed", () => {
    // The probe is advisory and the write is the authority — a rate-limited or
    // offline check must not strand the user in the wizard.
    expect(isUsernameValid("ada", "error")).toBe(true);
    expect(isUsernameValid("ada", "idle")).toBe(true);
  });

  it("never allows a malformed handle regardless of status", () => {
    expect(isUsernameValid("no", "available")).toBe(true);
    expect(isUsernameValid("a", "available")).toBe(false);
    expect(isUsernameValid("pricing", "available")).toBe(false);
  });
});

describe("onboarding business validation", () => {
  it("requires a legal name and nothing else", () => {
    expect(isBusinessValid("")).toBe(false);
    expect(isBusinessValid("   ")).toBe(false);
    expect(isBusinessValid("Analytical Engines Ltd")).toBe(true);
  });
});
