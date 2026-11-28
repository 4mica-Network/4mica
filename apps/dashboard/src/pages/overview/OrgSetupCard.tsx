import { cn } from "@4mica/ui";
import { getInvitations } from "@api/organization";
import { useAppSelector } from "@stores/hooks";
import {
  allows,
  selectActiveOrganization,
} from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import {
  selectActiveProjectId,
  selectProjectMembers,
  selectProjects,
} from "@stores/project/selector";
import { Check, Circle, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useWorkspaceMode } from "@/hooks/useWorkspaceMode";
import {
  readSetupDismissed,
  setupSteps,
  writeSetupDismissed,
} from "./setupSteps";

export function OrgSetupCard() {
  const { t } = useTranslation();
  const { personal, canManageOrg } = useWorkspaceMode();
  const organization = useAppSelector(selectActiveOrganization);
  const projects = useAppSelector(selectProjects);
  const activeProjectId = useAppSelector(selectActiveProjectId);
  const activeMembers = useAppSelector(selectProjectMembers);
  const organizationId = organization?.id ?? null;
  const eligible = Boolean(organization) && !personal && canManageOrg;
  const canSeeInvitations =
    eligible && allows(organization, PERMISSION.MEMBERS_MANAGE);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [invitationCount, setInvitationCount] = useState(0);

  useEffect(() => {
    setInvitationCount(0);
    if (!canSeeInvitations || !organizationId) {
      return;
    }
    let active = true;
    getInvitations()
      .then(({ items }) => active && setInvitationCount(items.length))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canSeeInvitations, organizationId]);

  if (!eligible || !organization) {
    return null;
  }

  const steps = setupSteps({
    memberCount: organization.memberCount,
    invitationCount,
    projects,
    activeProjectId,
    activeMembers,
  });
  const done = steps.filter((step) => step.done).length;
  const dismissed =
    dismissedFor === organization.id || readSetupDismissed(organization.id);

  if (dismissed || done === steps.length) {
    return null;
  }

  const dismiss = () => {
    writeSetupDismissed(organization.id);
    setDismissedFor(organization.id);
  };

  return (
    <section
      aria-labelledby="org-setup-title"
      className="mb-6 rounded-xl border border-overlay/10 bg-surface px-5 py-4"
      data-testid="org-setup"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-overlay/5 text-brand">
          <Users aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="org-setup-title"
            className="font-semibold text-ink-strong text-sm"
          >
            {t("overview.setup.title")}
          </h2>
          <p className="mt-0.5 text-ink-muted text-xs">
            {t("overview.setup.progress", { done, total: steps.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("overview.setup.dismiss")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-subtle hover:bg-overlay/5 hover:text-ink-strong"
          data-testid="org-setup-dismiss"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <ol className="mt-3 grid gap-2 md:grid-cols-3">
        {steps.map((step) => (
          <li key={step.id}>
            <NavLink
              to={step.to}
              className="flex h-full items-start gap-3 rounded-lg border border-overlay/10 px-3 py-2.5 transition-colors hover:bg-overlay/5"
              data-testid={`org-setup-${step.id}`}
              data-done={step.done}
            >
              <span
                className={cn(
                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                  step.done
                    ? "border-transparent bg-success text-surface-deep"
                    : "border-overlay/20 text-ink-subtle",
                )}
              >
                {step.done ? (
                  <Check
                    aria-hidden="true"
                    className="h-3 w-3"
                    strokeWidth={3}
                  />
                ) : (
                  <Circle aria-hidden="true" className="h-2 w-2" />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block font-medium text-sm",
                    step.done
                      ? "text-ink-muted line-through"
                      : "text-ink-strong",
                  )}
                >
                  {t(`overview.setup.${step.id}.title`)}
                </span>
                <span className="sr-only">
                  {step.done
                    ? t("overview.setup.statusDone")
                    : t("overview.setup.statusTodo")}
                </span>
                <span className="mt-0.5 block text-ink-muted text-xs">
                  {t(`overview.setup.${step.id}.hint`)}
                </span>
              </span>
            </NavLink>
          </li>
        ))}
      </ol>
    </section>
  );
}
