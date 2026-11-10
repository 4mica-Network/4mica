import { describe, expect, it } from "vitest";
import { buildCityTimezones, formatGMTOffset } from "./timezones";

describe("buildCityTimezones", () => {
  const zones = buildCityTimezones();

  it("keeps one city per time zone", () => {
    const ids = zones.map((zone) => zone.timezone);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names London for Europe/London", () => {
    expect(zones.find((zone) => zone.timezone === "Europe/London")?.city).toBe(
      "London",
    );
  });

  it("sorts by offset and formats every offset", () => {
    for (const zone of zones) {
      expect(zone.gmtOffset).toMatch(/^GMT[+-]\d{2}:\d{2}$/);
    }
    expect(zones[0]?.gmtOffset.startsWith("GMT-")).toBe(true);
    expect(zones.at(-1)?.gmtOffset.startsWith("GMT+")).toBe(true);
  });
});

describe("formatGMTOffset", () => {
  it("formats positive, negative and fractional offsets", () => {
    expect(formatGMTOffset(60)).toBe("GMT+01:00");
    expect(formatGMTOffset(-210)).toBe("GMT-03:30");
    expect(formatGMTOffset(345)).toBe("GMT+05:45");
    expect(formatGMTOffset(null)).toBe("GMT±00:00");
  });
});
