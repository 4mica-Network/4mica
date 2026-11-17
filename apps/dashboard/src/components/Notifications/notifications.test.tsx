import type { NotificationPlacement, User } from "@stores/user/type";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { toast } from "react-toastify";
import { createStore } from "redux";
import { afterEach, describe, expect, it } from "vitest";
import "@/i18n";
import { notifyError, notifySuccess } from "@/lib/notify";
import { Notifications } from "./index";

const renderAt = (placement?: NotificationPlacement) =>
  render(
    <Provider
      store={createStore(() => ({
        user: {
          user: placement
            ? ({ notificationPlacement: placement } as User)
            : null,
        },
      }))}
    >
      <Notifications />
    </Provider>,
  );

const containerOf = (text: string) =>
  screen.getByText(text).closest(".Toastify__toast-container")?.className;

afterEach(() => {
  act(() => toast.dismiss());
});

describe("notification placement", () => {
  it.each([
    ["topLeft", "top-left"],
    ["topRight", "top-right"],
    ["bottomLeft", "bottom-left"],
  ] as const)("shows every toast at the saved %s position", async (placement, position) => {
    renderAt(placement);

    act(() => {
      notifySuccess({ title: "Saved", content: "Done." });
      notifyError({ title: "Failed", content: "Try again." });
    });

    await waitFor(() => expect(screen.getByText("Failed")).toBeVisible());
    expect(containerOf("Saved")).toContain(`--${position}`);
    expect(containerOf("Failed")).toContain(`--${position}`);
  });

  it("falls back to the bottom right before the user loads", async () => {
    renderAt();

    act(() => notifySuccess({ title: "Hello", content: "" }));

    await waitFor(() => expect(screen.getByText("Hello")).toBeVisible());
    expect(containerOf("Hello")).toContain("--bottom-right");
  });

  it("still honours a placement passed for one toast", async () => {
    renderAt("bottomRight");

    act(() =>
      notifySuccess({ title: "Preview", content: "", placement: "topLeft" }),
    );

    await waitFor(() => expect(screen.getByText("Preview")).toBeVisible());
    expect(containerOf("Preview")).toContain("--top-left");
  });
});
