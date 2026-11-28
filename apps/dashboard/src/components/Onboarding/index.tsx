import { useAppSelector } from "@stores/hooks";
import {
  selectHasCompletedOnboarding,
  selectNeedsOnboarding,
} from "@stores/user/selector";
import { lazy, Suspense } from "react";
import { useWorkspaceMode } from "@/hooks/useWorkspaceMode";
import { translated } from "@/i18n/manifest";

const Wizard = lazy(
  translated("components/Onboarding/Wizard", () =>
    import("./Wizard").then((module) => ({ default: module.Wizard })),
  ),
);

const IntegrationChecklist = lazy(
  translated("components/IntegrationChecklist", () =>
    import("@/components/IntegrationChecklist").then((module) => ({
      default: module.IntegrationChecklist,
    })),
  ),
);

export function OnboardingGate() {
  const needsOnboarding = useAppSelector(selectNeedsOnboarding);
  const hasCompleted = useAppSelector(selectHasCompletedOnboarding);
  const { personal, canManageOrg } = useWorkspaceMode();

  if (needsOnboarding) {
    return (
      <Suspense fallback={null}>
        <Wizard />
      </Suspense>
    );
  }

  if (hasCompleted && (personal || canManageOrg)) {
    return (
      <Suspense fallback={null}>
        <IntegrationChecklist />
      </Suspense>
    );
  }

  return null;
}
