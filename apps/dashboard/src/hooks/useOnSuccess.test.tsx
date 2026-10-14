import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOnSuccess } from "./useOnSuccess";

const run = (initial: { pending: boolean; failed: boolean }) => {
  const onSuccess = vi.fn();
  const hook = renderHook(
    ({ pending, failed }) => useOnSuccess(pending, failed, onSuccess),
    { initialProps: initial },
  );
  return { onSuccess, rerender: hook.rerender };
};

describe("useOnSuccess", () => {
  it("fires once the request settles without an error", () => {
    const { onSuccess, rerender } = run({ pending: false, failed: false });

    rerender({ pending: true, failed: false });
    expect(onSuccess).not.toHaveBeenCalled();

    rerender({ pending: false, failed: false });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps the form when the request fails", () => {
    const { onSuccess, rerender } = run({ pending: false, failed: false });

    rerender({ pending: true, failed: false });
    rerender({ pending: false, failed: true });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does nothing on mount", () => {
    const { onSuccess } = run({ pending: false, failed: false });

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
