import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingGate } from "./index";

const { state, mode } = vi.hoisted(() => ({
  state: { needsOnboarding: false, hasCompleted: true },
  mode: { personal: true, canManageOrg: false },
}));

vi.mock("@stores/hooks", () => ({
  useAppSelector: (selector: () => boolean) => selector(),
}));

vi.mock("@stores/user/selector", () => ({
  selectNeedsOnboarding: () => state.needsOnboarding,
  selectHasCompletedOnboarding: () => state.hasCompleted,
}));

vi.mock("@/hooks/useWorkspaceMode", () => ({
  useWorkspaceMode: () => mode,
}));

vi.mock("@/i18n/manifest", () => ({
  translated: (_module: string, load: () => Promise<unknown>) => load,
}));

vi.mock("@/components/IntegrationChecklist", () => ({
  IntegrationChecklist: () => <div data-testid="integration-checklist" />,
}));

vi.mock("./Wizard", () => ({
  Wizard: () => <div data-testid="onboarding-wizard" />,
}));

describe("OnboardingGate", () => {
  beforeEach(() => {
    state.needsOnboarding = false;
    state.hasCompleted = true;
    mode.personal = true;
    mode.canManageOrg = false;
  });

  it("shows the integration checklist in a personal workspace", async () => {
    render(<OnboardingGate />);

    expect(
      await screen.findByTestId("integration-checklist"),
    ).toBeInTheDocument();
  });

  it("shows the integration checklist to organization owners and admins", async () => {
    mode.personal = false;
    mode.canManageOrg = true;
    render(<OnboardingGate />);

    expect(
      await screen.findByTestId("integration-checklist"),
    ).toBeInTheDocument();
  });

  it("hides the integration checklist from other organization members", () => {
    mode.personal = false;
    render(<OnboardingGate />);

    expect(screen.queryByTestId("integration-checklist")).toBeNull();
  });

  it("still runs the onboarding wizard for an invited member", async () => {
    mode.personal = false;
    state.needsOnboarding = true;
    render(<OnboardingGate />);

    expect(await screen.findByTestId("onboarding-wizard")).toBeInTheDocument();
  });
});
