import { cn, Tooltip } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { switchEnvironment } from "@stores/project/actions";
import {
  selectActiveProject,
  selectEnvironment,
} from "@stores/project/selector";
import { ENVIRONMENTS, type Environment } from "@stores/project/type";
import { FlaskConical, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLeaveDetail } from "./useLeaveDetail";

const ICONS = { sandbox: FlaskConical, production: Radio };

export function EnvironmentToggle({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const leaveDetail = useLeaveDetail();
  const environment = useAppSelector(selectEnvironment);
  const project = useAppSelector(selectActiveProject);

  if (!project) {
    return null;
  }

  const choose = (next: Environment) => {
    if (next === environment) {
      return;
    }
    leaveDetail();
    dispatch(switchEnvironment(next));
  };

  const isProduction = environment === "production";
  const Icon = ICONS[environment];

  if (collapsed) {
    const other = isProduction ? "sandbox" : "production";
    return (
      <Tooltip
        title={t(`environment.${environment}`)}
        placement="right"
        delay={80}
      >
        <span className="block w-full">
          <button
            type="button"
            aria-label={t("environment.switchTo", {
              environment: t(`environment.${other}`),
            })}
            onClick={() => choose(other)}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-md",
              isProduction
                ? "bg-warning/15 text-warning"
                : "text-ink-muted hover:bg-overlay/5",
            )}
            data-testid="environment-toggle"
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </button>
        </span>
      </Tooltip>
    );
  }

  return (
    <div className="flex flex-col gap-1" data-testid="environment-toggle">
      <fieldset
        aria-label={t("environment.label")}
        className={cn(
          "m-0 grid grid-cols-2 gap-0.5 rounded-lg border p-0.5",
          isProduction
            ? "border-warning/40 bg-warning/5"
            : "border-overlay/10 bg-overlay/5",
        )}
      >
        {ENVIRONMENTS.map((value) => {
          const active = value === environment;
          const OptionIcon = ICONS[value];
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/60",
                active && value === "production"
                  ? "bg-warning text-surface-deep shadow-sm"
                  : active
                    ? "bg-overlay/10 text-ink-strong shadow-sm"
                    : "text-ink-subtle hover:text-ink-body",
              )}
              data-testid={`environment-${value}`}
            >
              <OptionIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t(`environment.${value}`)}
            </button>
          );
        })}
      </fieldset>
      <p
        className={cn(
          "px-1 text-2xs",
          isProduction ? "text-warning" : "text-ink-subtle",
        )}
        data-testid="environment-hint"
      >
        {t(
          isProduction
            ? "environment.productionHint"
            : "environment.sandboxHint",
        )}
      </p>
    </div>
  );
}

export function EnvironmentBar() {
  const { t } = useTranslation();
  const environment = useAppSelector(selectEnvironment);
  const project = useAppSelector(selectActiveProject);

  if (!project) {
    return null;
  }

  if (environment === "production") {
    return (
      <div
        className="sticky top-0 z-20 flex items-center justify-center gap-2 border-warning/40 border-b bg-warning/10 px-4 py-1 text-warning text-xs"
        data-testid="environment-bar"
      >
        <span className="rounded-full bg-warning px-2 py-0.5 font-semibold text-2xs text-surface-deep uppercase tracking-wide">
          {t("environment.production")}
        </span>
        {t("environment.productionBar", { project: project.name })}
      </div>
    );
  }

  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-center gap-2 border-overlay/10 border-b border-dashed bg-overlay/5 px-4 py-1 text-ink-muted text-xs"
      data-testid="environment-bar"
    >
      <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
      {t("environment.sandboxBar", { project: project.name })}
    </div>
  );
}
