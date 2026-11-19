import { useAppSelector } from "@stores/hooks";
import {
  selectHasCompletedOnboarding,
  selectNeedsOnboarding,
} from "@stores/user/selector";
import { lazy, Suspense } from "react";

const Wizard = lazy(() =>
  import("./Wizard").then((module) => ({ default: module.Wizard })),
);

const IntegrationChecklist = lazy(() =>
  import("@/components/IntegrationChecklist").then((module) => ({
    default: module.IntegrationChecklist,
  })),
);

export function OnboardingGate() {
  const needsOnboarding = useAppSelector(selectNeedsOnboarding);
  const hasCompleted = useAppSelector(selectHasCompletedOnboarding);

  if (needsOnboarding) {
    return (
      <Suspense fallback={null}>
        <Wizard />
      </Suspense>
    );
  }

  if (hasCompleted) {
    return (
      <Suspense fallback={null}>
        <IntegrationChecklist />
      </Suspense>
    );
  }

  return null;
}
