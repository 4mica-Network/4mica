import { useAppSelector } from "@stores/hooks";
import {
  selectHasCompletedOnboarding,
  selectNeedsOnboarding,
} from "@stores/user/selector";
import { IntegrationChecklist } from "@/components/IntegrationChecklist";
import { Wizard } from "./Wizard";

/**
 * The single mount point for post-sign-in guidance: the blocking wizard, or the
 * integration checklist, never both.
 *
 * Both selectors are null-safe, so before GET /me resolves neither renders and
 * the modal cannot flash over the app.
 */
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
