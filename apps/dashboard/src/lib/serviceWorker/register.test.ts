import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./register";

const register = vi.fn(async () => ({}));

afterEach(() => {
  register.mockClear();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

const withServiceWorkers = () =>
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });

describe("registerServiceWorker", () => {
  it("registers the worker once the page has loaded", () => {
    withServiceWorkers();

    registerServiceWorker(true);
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("stays off outside production builds", () => {
    withServiceWorkers();

    registerServiceWorker(false);
    window.dispatchEvent(new Event("load"));

    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing in a browser without service workers", () => {
    expect(() => registerServiceWorker(true)).not.toThrow();
  });
});
