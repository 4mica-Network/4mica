import { readFileSync } from "node:fs";
import { act, render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { PageBoundary } from "@/components/ErrorBoundary/PageBoundary";
import { reloadForNewVersion } from "@/lib/chunkReload";

const reload = vi.fn();
let online = true;

beforeEach(() => {
  online = true;
  reload.mockClear();
  sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const goOnline = (value: boolean) => {
  online = value;
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
};

const renderMissingChunk = () => {
  const Missing = lazy(() =>
    Promise.reject(
      new TypeError("Failed to fetch dynamically imported module: /x.js"),
    ),
  );
  return render(
    <MemoryRouter>
      <PageBoundary>
        <Suspense fallback={null}>
          <Missing />
        </Suspense>
      </PageBoundary>
    </MemoryRouter>,
  );
};

describe("a page that cannot load while offline", () => {
  it("never reloads into the browser's offline page", () => {
    online = false;

    expect(reloadForNewVersion()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("explains the connection problem instead of offering a new version", async () => {
    online = false;
    renderMissingChunk();

    expect(
      await screen.findByTestId("crash-offline-empty-state"),
    ).toHaveTextContent("You're offline");
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads by itself once the connection is back", async () => {
    online = false;
    renderMissingChunk();
    await screen.findByTestId("crash-offline-empty-state");

    goOnline(true);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("unsupported browsers", () => {
  const script = readFileSync("public/browser-check.js", "utf8");

  const runCheck = () => {
    const page = document.implementation.createHTMLDocument("check");
    page.body.innerHTML = '<div id="root"></div>';
    new Function("document", script)(page);
    page.dispatchEvent(new Event("DOMContentLoaded"));
    return page;
  };

  it("replaces the app with an explanation when a required feature is missing", () => {
    const page = runCheck();

    expect(page.documentElement.hasAttribute("data-unsupported")).toBe(true);
    expect(page.querySelector("h1")?.textContent).toBe(
      "Your browser is not supported",
    );
  });

  it("leaves a current browser alone", () => {
    vi.stubGlobal("CSS", {
      supports: () => true,
      registerProperty: () => {},
    });
    Object.defineProperty(HTMLElement.prototype, "inert", {
      configurable: true,
      value: false,
    });

    const page = runCheck();

    expect(page.documentElement.hasAttribute("data-unsupported")).toBe(false);
    expect(page.getElementById("root")?.innerHTML).toBe("");

    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as { inert?: boolean }).inert;
  });
});

describe("the page shell", () => {
  const html = readFileSync("index.html", "utf8");

  it("paints no spinner of its own before the app bundle arrives", () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain("boot");
  });

  it("checks browser support without blocking the first paint", () => {
    expect(html).toContain('<script src="/browser-check.js" defer></script>');
    expect(html.indexOf("browser-check.js")).toBeLessThan(
      html.indexOf('type="module"'),
    );
  });

  it("tells visitors without JavaScript what to do", () => {
    expect(html).toMatch(
      /<noscript>[\s\S]*JavaScript is turned off[\s\S]*<\/noscript>/,
    );
  });

  it("resizes the layout for on-screen keyboards", () => {
    expect(html).toContain("interactive-widget=resizes-content");
  });
});
