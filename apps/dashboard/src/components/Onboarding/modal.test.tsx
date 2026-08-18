import { Modal } from "@4mica/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const Fixture = (props: Partial<Parameters<typeof Modal>[0]>) => (
  <Modal isOpen onClose={vi.fn()} title="Set up" {...props}>
    <input aria-label="first" />
    <input aria-label="second" />
  </Modal>
);

/**
 * packages/ui is otherwise covered by stories + Chromatic, which cannot assert
 * behaviour. The Modal hand-rolls focus trapping, Escape, scroll lock and focus
 * restore — none of which have a precedent in this package — so it carries the
 * package's first render tests. A layout-based visibility filter in the trap
 * silently disabled Tab inside every dialog, and only these caught it.
 */
describe("Modal a11y", () => {
  it("exposes dialog semantics wired to the title", () => {
    render(<Fixture />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Set up");
  });

  it("moves focus to the first focusable, which is the close button", () => {
    render(<Fixture data-testid="m" />);
    expect(screen.getByTestId("m-close")).toHaveFocus();
  });

  it("moves focus to the first field when there is no close button", () => {
    render(<Fixture showClose={false} />);
    expect(screen.getByLabelText("first")).toHaveFocus();
  });

  it("locks background scroll while open and restores it after", () => {
    const { unmount } = render(<Fixture />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close on Escape when that is disabled", async () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} disableEscapeClose />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on an overlay click, unless disabled", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Fixture onClose={onClose} data-testid="m" />);
    await userEvent.click(screen.getByTestId("m-overlay"));
    expect(onClose).toHaveBeenCalled();
    unmount();

    const blocked = vi.fn();
    render(<Fixture onClose={blocked} disableOverlayClose data-testid="b" />);
    await userEvent.click(screen.getByTestId("b-overlay"));
    expect(blocked).not.toHaveBeenCalled();
  });

  it("wraps Tab from the last focusable back to the first", async () => {
    render(<Fixture showClose={false} />);
    const first = screen.getByLabelText("first");
    const second = screen.getByLabelText("second");

    expect(first).toHaveFocus();
    await userEvent.tab();
    expect(second).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(second).toHaveFocus();
  });

  it("hides the close button when asked", () => {
    render(<Fixture showClose={false} data-testid="m" />);
    expect(screen.queryByTestId("m-close")).toBeNull();
  });
});
