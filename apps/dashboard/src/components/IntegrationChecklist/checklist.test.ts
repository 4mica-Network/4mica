import { describe, expect, it } from "vitest";
import { CHECKLIST_VERSION, shouldShowChecklist } from "./index";

const prefs = (over: Record<string, unknown> = {}) => ({
  collapsed: false,
  dismissed: false,
  version: CHECKLIST_VERSION,
  ...over,
});

describe("shouldShowChecklist", () => {
  it("shows while there is anything left to do", () => {
    expect(shouldShowChecklist(prefs(), 4, 8)).toBe(true);
  });

  it("hides once everything is done", () => {
    expect(shouldShowChecklist(prefs(), 8, 8)).toBe(false);
  });

  it("honours a dismissal of the current steps", () => {
    expect(shouldShowChecklist(prefs({ dismissed: true }), 4, 8)).toBe(false);
  });

  it("comes back when the steps change under an old dismissal", () => {
    expect(
      shouldShowChecklist(
        prefs({ dismissed: true, version: CHECKLIST_VERSION - 1 }),
        4,
        8,
      ),
    ).toBe(true);
  });

  it("comes back for a dismissal stored before versioning existed", () => {
    expect(
      shouldShowChecklist({ collapsed: false, dismissed: true }, 4, 8),
    ).toBe(true);
  });

  it("stays hidden when everything is done, whatever the version", () => {
    expect(
      shouldShowChecklist({ collapsed: false, dismissed: false }, 8, 8),
    ).toBe(false);
  });
});
