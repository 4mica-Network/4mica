import { useAppSelector } from "@stores/hooks";
import {
  selectHasCompletedOnboarding,
  selectNeedsOnboarding,
} from "@stores/user/selector";
import { lazy, Suspense } from "react";
import { IntegrationChecklist } from "@/components/IntegrationChecklist";

const Wizard = lazy(() =>
  import("./Wizard").then((module) => ({ default: module.Wizard })),
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
    return <IntegrationChecklist />;
  }

  return null;
}
