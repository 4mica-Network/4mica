import { describe, expect, it } from "vitest";
import { FOOTER_ITEMS, NAV_SECTIONS, navItems, SETTINGS_SECTIONS } from "./nav";
import { pageAt, SETTINGS_PAGES } from "./routes";

describe("settings navigation", () => {
  it("lists the same settings pages as the router", () => {
    const linked = new Set(navItems(SETTINGS_SECTIONS).map((item) => item.to));

    expect([...linked].sort()).toEqual(
      SETTINGS_PAGES.map((page) => `/settings/${page.path}`).sort(),
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
    ...new Set(
      [
        ...navItems(NAV_SECTIONS),
        ...FOOTER_ITEMS,
        ...navItems(SETTINGS_SECTIONS),
      ].map((item) => item.to),
    ),
  ];

  it.each(links)("can load the code for %s before it is clicked", (to) => {
    const page = pageAt(to) as { preload?: unknown } | undefined;

    expect(typeof page?.preload).toBe("function");
  });

  it("finds nothing for a path the router does not serve", () => {
    expect(pageAt("/nowhere")).toBeUndefined();
  });
});
