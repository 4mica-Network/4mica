import { INITIAL_STATE } from "@stores/compliance/reducer";
import type { BeneficialOwner, ComplianceState } from "@stores/compliance/type";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import "@/i18n";

const { ComplianceSettings } = await import("./index");
const actionTypes = (await import("@stores/compliance/actionTypes")).default;

const OWNER: BeneficialOwner = {
  id: "owner-1",
  fullName: "Ada Lovelace",
  role: "OWNER",
  ownershipPercent: 60,
  dateOfBirth: "1985-12-10",
  nationality: "GB",
  countryOfResidence: "GB",
  email: null,
  isPep: true,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

const renderPage = (compliance: Partial<ComplianceState> = {}) => {
  const dispatched: { type: string }[] = [];
  const state = {
    compliance: { ...INITIAL_STATE, hasLoaded: true, ...compliance },
    user: { business: null },
  };

  const store = {
    getState: () => state,
    subscribe: () => () => {},
    dispatch: (action: { type: string }) => {
      dispatched.push(action);
      return action;
    },
  };

  render(
    // biome-ignore lint/suspicious/noExplicitAny: a minimal store stub, deliberately not a full redux Store.
    <Provider store={store as any}>
      <MemoryRouter>
        <ComplianceSettings />
      </MemoryRouter>
    </Provider>,
  );

  return dispatched;
};

describe("compliance page", () => {
  it("loads the compliance details on arrival", () => {
    const dispatched = renderPage();

    expect(dispatched.map((a) => a.type)).toContain(
      actionTypes.FETCH_COMPLIANCE_REQUESTED,
    );
  });

  it("lists what is missing and holds back submission", () => {
    renderPage({ missing: ["business.taxId", "owners"] });

    expect(screen.getByRole("link", { name: /Tax ID/ })).toHaveAttribute(
      "href",
      "/settings/business",
    );
    expect(
      screen.getByRole("link", { name: "At least one person" }),
    ).toHaveAttribute("href", "#compliance-people");
    expect(
      screen.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
  });

  it("submits once nothing is missing", async () => {
    const dispatched = renderPage({ missing: [] });

    await userEvent.click(
      screen.getByRole("button", { name: "Submit for review" }),
    );

    expect(dispatched.map((a) => a.type)).toContain(
      actionTypes.SUBMIT_COMPLIANCE_REQUESTED,
    );
  });

  it("offers a resubmission after a rejection", () => {
    renderPage({ kybStatus: "REJECTED", missing: [] });

    expect(screen.getByRole("button", { name: "Submit again" })).toBeEnabled();
  });

  it("shows each person with their role, share and exposure", () => {
    renderPage({ owners: [OWNER] });

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Politically exposed")).toBeInTheDocument();
    expect(screen.getByText("60% of ownership assigned")).toBeInTheDocument();
  });

  it("adds a person through the form", async () => {
    const dispatched = renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Add a person" }));
    await userEvent.type(
      screen.getByLabelText("Full legal name"),
      "Charles Babbage",
    );
    await userEvent.type(screen.getByLabelText("Ownership"), "40");
    await userEvent.type(screen.getByLabelText("Date of birth"), "1971-12-26");
    await userEvent.type(screen.getByLabelText("Nationality"), "gb");
    await userEvent.type(screen.getByLabelText("Country of residence"), "gb");

    const submit = screen
      .getAllByRole("button", { name: "Add a person" })
      .find((button) => button.getAttribute("type") === "submit");
    expect(submit).toBeDefined();
    await userEvent.click(submit as HTMLElement);

    const created = dispatched.find(
      (a) => a.type === actionTypes.CREATE_OWNER_REQUESTED,
    ) as { payload?: unknown } | undefined;
    expect(created?.payload).toEqual({
      fullName: "Charles Babbage",
      role: "OWNER",
      ownershipPercent: 40,
      dateOfBirth: "1971-12-26",
      nationality: "GB",
      countryOfResidence: "GB",
      email: null,
      isPep: false,
    });
  });

  it("locks everything while the review is pending", () => {
    renderPage({
      kybStatus: "PENDING",
      owners: [OWNER],
      profile: null,
    });

    expect(
      screen.queryByRole("button", { name: "Add a person" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Ada Lovelace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Submit/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Country of incorporation")).toBeDisabled();
  });
});
