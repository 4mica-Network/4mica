import { describe, expect, it } from "vitest";
import {
  countryError,
  isAdult,
  type OwnerDraft,
  ownerErrors,
  parseRegions,
  pastDateError,
  percentError,
} from "./validation";

const DRAFT: OwnerDraft = {
  fullName: "Ada Lovelace",
  role: "OWNER",
  ownershipPercent: "60",
  dateOfBirth: "1985-12-10",
  nationality: "GB",
  countryOfResidence: "GB",
  email: "",
  isPep: false,
};

describe("compliance validation", () => {
  it("accepts two-letter country codes in any case", () => {
    expect(countryError("gb")).toBeUndefined();
    expect(countryError("")).toBeUndefined();
    expect(countryError("GBR")).toEqual({ key: "validation.countryCode" });
  });

  it("refuses a date in the future", () => {
    expect(pastDateError("2020-01-01")).toBeUndefined();
    expect(pastDateError("2999-01-01")).toEqual({ key: "validation.pastDate" });
  });

  it("knows the day someone turns eighteen", () => {
    const now = new Date("2026-10-21T12:00:00Z");

    expect(isAdult("2008-10-21", now)).toBe(true);
    expect(isAdult("2008-10-22", now)).toBe(false);
  });

  it("reads a comma-separated list of regions", () => {
    expect(parseRegions("gb, US ,gb,")).toEqual(["GB", "US"]);
    expect(parseRegions("")).toEqual([]);
    expect(parseRegions("GB, Germany")).toBeNull();
  });

  it("takes whole percentages from 1 to 100", () => {
    expect(percentError("25")).toBeUndefined();
    expect(percentError("0")).toBeDefined();
    expect(percentError("101")).toBeDefined();
    expect(percentError("2.5")).toBeDefined();
  });

  it("passes a complete person", () => {
    expect(ownerErrors(DRAFT)).toEqual({});
  });

  it("needs a share from an owner but not from a director", () => {
    expect(ownerErrors({ ...DRAFT, ownershipPercent: "" })).toHaveProperty(
      "ownershipPercent",
    );
    expect(
      ownerErrors({ ...DRAFT, role: "DIRECTOR", ownershipPercent: "" }),
    ).toEqual({});
  });

  it("refuses someone under eighteen", () => {
    const minor = new Date();
    minor.setUTCFullYear(minor.getUTCFullYear() - 10);

    expect(
      ownerErrors({ ...DRAFT, dateOfBirth: minor.toISOString().slice(0, 10) }),
    ).toHaveProperty("dateOfBirth");
  });
});
