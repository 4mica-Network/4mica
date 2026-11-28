import { cn } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { projectPendingKeys, updateProject } from "@stores/project/actions";
import {
  selectIsProjectPending,
  selectProjectCan,
} from "@stores/project/selector";
import { PROJECT_PERMISSION, type ProjectSummary } from "@stores/project/type";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Disclosure } from "@/components/Disclosure";
import { SettingsSection } from "@/components/layout";
import { MembersSection } from "./MembersSection";

const OPTIONS = [
  { restricted: false, value: "everyone" },
  { restricted: true, value: "chosen" },
] as const;

export function AccessSection({ project }: { project: ProjectSummary }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canUpdate = useAppSelector(
    selectProjectCan(PROJECT_PERMISSION.PROJECT_UPDATE),
  );
  const isSaving = useAppSelector(
    selectIsProjectPending(projectPendingKeys.update),
  );
  const [requested, setRequested] = useState<boolean | null>(null);
  const restricted =
    !project.isDefault &&
    (isSaving && requested !== null ? requested : project.restricted);

  const choose = (value: boolean) => {
    if (value === restricted) {
      return;
    }
    setRequested(value);
    dispatch(updateProject({ restricted: value }));
  };

  return (
    <>
      <SettingsSection
        title={t("projects.access.title")}
        description={
          project.isDefault
            ? t("projects.access.defaultHint")
            : t("projects.access.description")
        }
      >
        {!project.isDefault && (
          <fieldset
            disabled={!canUpdate || isSaving}
            className="m-0 grid min-w-0 gap-2 border-0 p-0 sm:grid-cols-2"
            data-testid="project-access"
          >
            <legend className="sr-only">{t("projects.access.title")}</legend>
            {OPTIONS.map((option) => {
              const checked = option.restricted === restricted;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border bg-surface px-4 py-3",
                    checked ? "border-brand" : "border-overlay/10",
                  )}
                >
                  <input
                    type="radio"
                    name={`project-access-${project.id}`}
                    value={option.value}
                    checked={checked}
                    onChange={() => choose(option.restricted)}
                    className="mt-1 accent-brand"
                    data-testid={`project-access-${option.value}`}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink-strong text-sm">
                      {t(`projects.access.${option.value}`)}
                    </span>
                    <span className="mt-0.5 block text-ink-muted text-xs">
                      {t(`projects.access.${option.value}Hint`)}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
      </SettingsSection>

      {restricted ? (
        <MembersSection restricted />
      ) : (
        <Disclosure
          label={t("projects.access.roles")}
          data-testid="project-roles"
        >
          <MembersSection restricted={false} />
        </Disclosure>
      )}
    </>
  );
}
