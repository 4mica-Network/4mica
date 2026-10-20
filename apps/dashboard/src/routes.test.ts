import { describe, expect, it } from "vitest";
import { FOOTER_ITEMS, SETTINGS_NAV } from "./nav";
import { SETTINGS_PAGES } from "./routes";

describe("settings navigation", () => {
  it("lists the same settings pages, in the same order, as the router", () => {
    expect(SETTINGS_NAV.map((item) => item.to)).toEqual(
      SETTINGS_PAGES.map((page) => `/settings/${page.path}`),
    );
  });

  it("sends the footer link to the settings index", () => {
    expect(
      FOOTER_ITEMS.find((item) => item.labelKey === "nav.settings")?.to,
    ).toBe("/settings");
  });
});
