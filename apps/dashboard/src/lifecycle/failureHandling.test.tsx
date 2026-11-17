import { fireEvent, render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { PageBoundary } from "@/components/ErrorBoundary/PageBoundary";
import { isChunkLoadError, reloadForNewVersion } from "@/lib/chunkReload";

const reload = vi.fn();

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function Boom(): never {
  throw new Error("render failed");
}

function Nav({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go
    </button>
  );
}

describe("page error boundary", () => {
  it("shows a recovery message instead of a blank screen and keeps the rest of the app", () => {
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <nav>sidebar</nav>
        <Routes>
          <Route
            path="/broken"
            element={
              <PageBoundary>
                <Boom />
              </PageBoundary>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("crash-empty-state")).toBeInTheDocument();
    expect(screen.getByText("sidebar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload page" }),
    ).toBeInTheDocument();
  });

  it("recovers by itself when the user navigates to another page", () => {
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <Nav to="/fine" />
        <Routes>
          <Route
            path="*"
            element={
              <PageBoundary>
                <Routes>
                  <Route path="/broken" element={<Boom />} />
                  <Route path="/fine" element={<p>fine page</p>} />
                </Routes>
              </PageBoundary>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("crash-empty-state")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByText("fine page")).toBeInTheDocument();
  });

  it("reloads once for a page chunk that a new deployment removed", async () => {
    const Missing = lazy(() =>
      Promise.reject(
        new TypeError(
          "Failed to fetch dynamically imported module: /assets/payments-old.js",
        ),
      ),
    );

    render(
      <MemoryRouter>
        <PageBoundary>
          <Suspense fallback={null}>
            <Missing />
          </Suspense>
        </PageBoundary>
      </MemoryRouter>,
    );

    await screen.findByTestId("crash-new-version-empty-state");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("asks the user to reload instead of looping when the reload did not help", async () => {
    sessionStorage.setItem("4mica.chunkReloadAt", String(Date.now()));
    const Missing = lazy(() =>
      Promise.reject(
        new TypeError("Failed to fetch dynamically imported module"),
      ),
    );

    render(
      <MemoryRouter>
        <PageBoundary>
          <Suspense fallback={null}>
            <Missing />
          </Suspense>
        </PageBoundary>
      </MemoryRouter>,
    );

    await screen.findByTestId("crash-new-version-empty-state");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("stale chunk detection", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://app/x.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/index.css",
  ])("recognises %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("ignores ordinary errors", () => {
    expect(isChunkLoadError(new Error("render failed"))).toBe(false);
    expect(isChunkLoadError("nope")).toBe(false);
  });

  it("reloads at most once in a short window", () => {
    expect(reloadForNewVersion(100_000)).toBe(true);
    expect(reloadForNewVersion(105_000)).toBe(false);
    expect(reloadForNewVersion(200_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
