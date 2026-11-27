import { INITIAL_STATE } from "@stores/user/reducer";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { PlansSettings } from "@/pages/plans";

const renderPage = (page: React.ReactNode) =>
  render(
    <Provider store={createStore(() => ({ user: INITIAL_STATE }))}>
      <MemoryRouter>{page}</MemoryRouter>
    </Provider>,
  );

describe.each([
  [
    "plans",
    <PlansSettings key="plans" />,
    "Plans",
    "Plans and billing are on their way",
  ],
])("the %s settings page", (name, page, heading, message) => {
  it("keeps its page and says the feature is coming", () => {
    renderPage(page);

    expect(
      screen.getByRole("heading", { level: 1, name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: message })).toHaveTextContent(
      "Coming soon",
    );
  });

  it("shows the preview without letting anyone use or hear it", () => {
    renderPage(page);
    const preview = screen
      .getByTestId(`${name}-coming-soon`)
      .querySelector("[inert]");

    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
