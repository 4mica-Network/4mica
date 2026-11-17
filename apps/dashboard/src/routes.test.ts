import { describe, expect, it } from "vitest";
import { FOOTER_ITEMS, NAV_SECTIONS, SETTINGS_NAV } from "./nav";
import { pageAt, SETTINGS_PAGES } from "./routes";

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

describe("sidebar preloading", () => {
  const links = [
    ...NAV_SECTIONS.flatMap((section) => section.items),
    ...FOOTER_ITEMS,
    ...SETTINGS_NAV,
  ].map((item) => item.to);

  it.each(links)("can load the code for %s before it is clicked", (to) => {
    const page = pageAt(to) as { preload?: unknown } | undefined;

    expect(typeof page?.preload).toBe("function");
  });

  it("finds nothing for a path the router does not serve", () => {
    expect(pageAt("/nowhere")).toBeUndefined();
  });
});
