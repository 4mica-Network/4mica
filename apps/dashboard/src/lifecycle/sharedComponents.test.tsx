import { Tooltip } from "@4mica/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not open after its anchor has unmounted", () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(
      <Tooltip title="Copy" delay={200} onOpenChange={onOpenChange}>
        <button type="button">anchor</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "anchor" }));
    unmount();
    vi.advanceTimersByTime(500);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("still opens after the delay while mounted", () => {
    const onOpenChange = vi.fn();
    render(
      <Tooltip title="Copy" delay={200} onOpenChange={onOpenChange}>
        <button type="button">anchor</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "anchor" }));
    vi.advanceTimersByTime(200);

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
