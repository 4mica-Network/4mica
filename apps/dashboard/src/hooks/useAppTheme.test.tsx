import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { user: null as { appTheme: string } | null },
}));

vi.mock("@stores/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ user: { user: state.user } }),
}));

const { useAppTheme } = await import("./useAppTheme");
const { THEME_STORAGE_KEY } = await import("@/lib/theme");

const root = document.documentElement;

describe("useAppTheme", () => {
  beforeEach(() => {
    root.classList.add("dark");
    localStorage.clear();
  });

  afterEach(() => {
    root.classList.add("dark");
    root.style.colorScheme = "";
  });

  it("leaves the pre-paint theme alone until the user has loaded", () => {
    state.user = null;
    renderHook(() => useAppTheme());

    expect(root.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("applies the light dashboard theme and remembers it for the next load", () => {
    state.user = { appTheme: "light" };
    renderHook(() => useAppTheme());

    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("switches back to dark when the setting changes", () => {
    state.user = { appTheme: "light" };
    const { rerender } = renderHook(() => useAppTheme());
    expect(root.classList.contains("dark")).toBe(false);

    state.user = { appTheme: "dark" };
    rerender();

    expect(root.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("follows the operating system when set to system", () => {
    const listeners: (() => void)[] = [];
    let prefersDark = false;
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return prefersDark;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    }));

    state.user = { appTheme: "system" };
    renderHook(() => useAppTheme());
    expect(root.classList.contains("dark")).toBe(false);

    prefersDark = true;
    for (const listener of listeners) {
      listener();
    }
    expect(root.classList.contains("dark")).toBe(true);

    vi.unstubAllGlobals();
  });
});
