import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n";
import { ProfileTabs } from ".";

const renderTabs = () =>
  render(
    <ProfileTabs
      agentCount={1}
      agents={<a href="/a">Agent one</a>}
      apiCount={2}
      apis={<a href="/b">API one</a>}
    />,
  );

describe("ProfileTabs", () => {
  it("points every tab at a panel that exists", () => {
    renderTabs();

    for (const tab of screen.getAllByRole("tab")) {
      const id = tab.getAttribute("aria-controls") ?? "";
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("switches tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.tab();
    const agents = screen.getByRole("tab", {
      name: new RegExp(messages.profile.agentsHeading),
    });
    expect(agents).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const apis = screen.getByRole("tab", {
      name: new RegExp(messages.profile.apisHeading),
    });
    expect(apis).toHaveFocus();
    expect(apis).toHaveAttribute("aria-selected", "true");
    expect(agents).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("API one");

    await user.tab();
    expect(screen.getByRole("link", { name: "API one" })).toHaveFocus();
  });
});
