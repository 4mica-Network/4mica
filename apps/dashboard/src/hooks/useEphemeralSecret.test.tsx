import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EPHEMERAL_SECRET_TTL_MS,
  useEphemeralSecret,
} from "./useEphemeralSecret";

const auth = { isSignedIn: true };

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => auth,
}));

const secret = {
  kind: "apiKey" as const,
  id: "key_1",
  plaintext: "4mica_sk_secret",
};

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("useEphemeralSecret", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    auth.isSignedIn = true;
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it("holds a revealed secret until it is cleared", () => {
    const { result } = renderHook(() => useEphemeralSecret());

    act(() => result.current.reveal(secret));
    expect(result.current.secret).toEqual(secret);

    act(() => result.current.clear());
    expect(result.current.secret).toBeNull();
  });

  it("forgets the secret after the timeout", () => {
    const { result } = renderHook(() => useEphemeralSecret());

    act(() => result.current.reveal(secret));
    act(() => {
      vi.advanceTimersByTime(EPHEMERAL_SECRET_TTL_MS - 1);
    });
    expect(result.current.secret).toEqual(secret);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.secret).toBeNull();
  });

  it("forgets the secret when the tab is hidden", () => {
    const { result } = renderHook(() => useEphemeralSecret());

    act(() => result.current.reveal(secret));
    act(() => setHidden(true));

    expect(result.current.secret).toBeNull();
  });

  it("forgets the secret on sign-out", () => {
    const { result, rerender } = renderHook(() => useEphemeralSecret());

    act(() => result.current.reveal(secret));
    auth.isSignedIn = false;
    rerender();

    expect(result.current.secret).toBeNull();
  });

  it("starts empty again after a remount", () => {
    const first = renderHook(() => useEphemeralSecret());
    act(() => first.result.current.reveal(secret));
    first.unmount();

    const second = renderHook(() => useEphemeralSecret());
    expect(second.result.current.secret).toBeNull();
  });
});
