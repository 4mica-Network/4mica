import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil, Trash2 } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RowActionsMenu } from ".";

const renderMenu = (onDelete = vi.fn()) =>
  render(
    <MemoryRouter>
      <RowActionsMenu label="More actions for Weather" data-testid="more">
        <RowActionsMenu.RouteItem icon={Pencil} to="/edit">
          Edit
        </RowActionsMenu.RouteItem>
        <RowActionsMenu.Item icon={Trash2} tone="danger" onSelect={onDelete}>
          Delete
        </RowActionsMenu.Item>
      </RowActionsMenu>
    </MemoryRouter>,
  );

describe("RowActionsMenu", () => {
  it("names the trigger and exposes a menu", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", {
      name: "More actions for Weather",
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    await userEvent.click(trigger);

    expect(
      screen.getByRole("menu", { name: "More actions for Weather" }),
    ).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("is operable from the keyboard", async () => {
    const onDelete = vi.fn();
    renderMenu(onDelete);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /More actions/ }));
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus(),
    );

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    renderMenu();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /More actions/ });

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
