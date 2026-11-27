import { Switch, Tooltip } from "@4mica/ui";
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

describe("Switch", () => {
  const state = () => screen.getByRole("switch").getAttribute("aria-checked");

  it("snaps back to the saved value when a save fails", () => {
    const { rerender } = render(<Switch initialState={false} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(state()).toBe("true");

    rerender(<Switch initialState={false} disabled />);
    rerender(<Switch initialState={false} />);

    expect(state()).toBe("false");
  });

  it("keeps the new value when the save succeeds", () => {
    const { rerender } = render(<Switch initialState={false} />);

    fireEvent.click(screen.getByRole("switch"));
    rerender(<Switch initialState={false} disabled />);
    rerender(<Switch initialState />);

    expect(state()).toBe("true");
  });

  it("follows its value while permanently disabled", () => {
    const { rerender } = render(<Switch initialState={false} disabled />);

    rerender(<Switch initialState disabled />);

    expect(state()).toBe("true");
  });
});
