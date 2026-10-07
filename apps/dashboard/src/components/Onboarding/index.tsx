import { useAppSelector } from "@stores/hooks";
import {
  selectHasCompletedOnboarding,
  selectNeedsOnboarding,
} from "@stores/user/selector";
import { IntegrationChecklist } from "@/components/IntegrationChecklist";
import { Wizard } from "./Wizard";

export function OnboardingGate() {
  const needsOnboarding = useAppSelector(selectNeedsOnboarding);
  const hasCompleted = useAppSelector(selectHasCompletedOnboarding);

  if (needsOnboarding) {
    return <Wizard />;
  }

  if (hasCompleted) {
    return <IntegrationChecklist />;
  }

  return null;
}
