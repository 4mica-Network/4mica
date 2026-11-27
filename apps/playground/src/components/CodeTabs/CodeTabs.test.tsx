import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n";
import { CodeTabs } from ".";

const renderTabs = () =>
  render(
    <CodeTabs
      tabs={[
        { id: "ts", label: "TypeScript", content: <pre>ts code</pre> },
        { id: "py", label: "Python", content: <pre>py code</pre> },
        { id: "sh", label: "cURL", content: <pre>curl code</pre> },
      ]}
    />,
  );

describe("CodeTabs", () => {
  it("labels the tablist and keeps only the selected tab in the tab order", () => {
    renderTabs();

    expect(
      screen.getByRole("tablist", { name: messages.integration.languageTabs }),
    ).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it("moves selection and focus with arrow, Home and End keys", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.tab();
    expect(screen.getByRole("tab", { name: "TypeScript" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const python = screen.getByRole("tab", { name: "Python" });
    expect(python).toHaveFocus();
    expect(python).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("py code");

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "cURL" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "TypeScript" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}{Home}");
    expect(screen.getByRole("tab", { name: "TypeScript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
