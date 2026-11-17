import { Select as UiSelect } from "@4mica/ui";
import { INITIAL_STATE as BANNER_INITIAL_STATE } from "@stores/banner/reducer";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FieldRow, Select, TextInput } from "@/components/form";
import "@/i18n";

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/components/IntegrationChecklist/useChecklist", () => ({
  useChecklist: () => ({
    done: 1,
    total: 3,
    items: [
      { id: "wallet", title: "Link a wallet", hint: "", to: "/", done: true },
      {
        id: "kyb",
        title: "Verify your business",
        hint: "",
        to: "/",
        done: false,
        pending: true,
      },
      { id: "key", title: "Create an API key", hint: "", to: "/", done: false },
    ],
  }),
}));

const { Sidebar } = await import("@/components/Sidebar");
const { IntegrationChecklist } = await import(
  "@/components/IntegrationChecklist"
);
const { Notifications } = await import("@/components/Notifications");
const { notifySuccess } = await import("@/lib/notify");

const violations = async (root: Element) => {
  const result = await axe.run(root, {
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map(
    (violation) => `${violation.id}: ${violation.nodes[0]?.html}`,
  );
};

const withStore = (ui: React.ReactNode) => {
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "u1", name: "Ada" } as User },
    developer: {},
    banner: BANNER_INITIAL_STATE,
  };
  return (
    <Provider store={createStore(() => state)}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>
  );
};

const setCompact = (compact: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: compact && query.includes("max-"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

const PLANS = [
  { value: "FREE", title: "Free" },
  { value: "PRO", title: "Pro" },
];

function PlanField() {
  const [plan, setPlan] = useState("FREE");
  const [name, setName] = useState("");
  return (
    <>
      <FieldRow title="Name" description="Shown on invoices" required>
        <TextInput value={name} onChange={setName} error="Give it a name" />
      </FieldRow>
      <FieldRow title="Plan">
        <Select value={plan} onChange={setPlan} options={PLANS} />
      </FieldRow>
    </>
  );
}

describe("accessibility", () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    localStorage.clear();
  });

  describe("form fields", () => {
    it("passes axe with an error and a select", async () => {
      const { container } = render(<PlanField />);

      expect(await violations(container)).toEqual([]);
    });

    it("names a field select by its label and current value", () => {
      render(<PlanField />);

      expect(
        screen.getByRole("button", { name: "Plan Free" }),
      ).toBeInTheDocument();
    });

    it("returns focus to the trigger after choosing from the keyboard", async () => {
      render(<PlanField />);
      const trigger = screen.getByRole("button", { name: "Plan Free" });
      trigger.focus();

      await userEvent.keyboard("{ArrowDown}");
      await waitFor(() =>
        expect(screen.getByRole("option", { name: "Free" })).toHaveFocus(),
      );
      await userEvent.keyboard("{ArrowDown}{Enter}");

      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAccessibleName("Plan Pro");
    });

    it("keeps a visually unlabelled select's value in its name", () => {
      render(
        <UiSelect
          aria-label="Filter by status"
          options={PLANS}
          value="PRO"
          onChange={() => {}}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Filter by status Pro" }),
      ).toBeInTheDocument();
    });
  });

  describe("sidebar", () => {
    it("passes axe and never marks working links as disabled", async () => {
      const { container } = render(withStore(<Sidebar collapsed={false} />));

      expect(await violations(container)).toEqual([]);
      expect(container.querySelector("[aria-disabled]")).toBeNull();
    });

    it("gives each collapsed nav link a single tab stop", async () => {
      const { container } = render(withStore(<Sidebar collapsed />));
      const nav = screen.getByRole("navigation");

      await waitFor(() =>
        expect(nav.querySelectorAll('[tabindex="0"]')).toHaveLength(0),
      );
      expect(nav.querySelectorAll("a[href]").length).toBeGreaterThan(0);
      expect(await violations(container)).toEqual([]);
    });
  });

  describe("integration checklist", () => {
    it("is a named landmark that states each step's status", async () => {
      setCompact(false);
      const { container } = render(withStore(<IntegrationChecklist />));

      const panel = screen.getByRole("complementary", {
        name: "Finish your integration",
      });
      expect(panel).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Link a wallet\s?Done/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Verify your business\s?In review/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Create an API key\s?To do/ }),
      ).toBeInTheDocument();
      expect(await violations(container)).toEqual([]);
    });

    it("starts collapsed on short or zoomed-in viewports", () => {
      setCompact(true);
      render(withStore(<IntegrationChecklist />));

      expect(
        screen.getByRole("button", { name: /Finish your integration/ }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("keeps the user's own choice over the viewport default", async () => {
      setCompact(true);
      render(withStore(<IntegrationChecklist />));

      await userEvent.click(
        screen.getByRole("button", { name: /Finish your integration/ }),
      );

      expect(
        screen.getByRole("button", { name: /Finish your integration/ }),
      ).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("notifications", () => {
    it("announces through one live region with the full message", async () => {
      render(<Notifications />);

      act(() => {
        notifySuccess({ title: "Saved", content: "Your changes are live." });
      });

      await waitFor(() =>
        expect(screen.getByText("Your changes are live.")).toBeInTheDocument(),
      );
      expect(screen.getAllByRole("region")).toHaveLength(1);
      expect(screen.getByRole("alert")).not.toHaveAttribute("aria-label");
    });
  });
});
