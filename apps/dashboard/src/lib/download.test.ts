import { describe, expect, it, vi } from "vitest";
import { saveBlob } from "./download";

describe("saveBlob", () => {
  it("clicks a temporary download link and cleans it up", () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    vi.useFakeTimers();
    const clicks: HTMLAnchorElement[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this);
      });

    saveBlob(new Blob(["a,b"]), "report.csv");

    expect(clicks[0].download).toBe("report.csv");
    expect(clicks[0].href).toBe("blob:csv");
    expect(document.querySelector("a[download]")).toBeNull();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv");

    click.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
