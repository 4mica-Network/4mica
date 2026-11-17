import { Card, Tag } from "@4mica/ui";
import { useTranslation } from "react-i18next";
import { ComingSoon, Placeholder } from "@/components/ComingSoon";
import { SettingsPanel } from "@/components/SettingsPanel";

export function PlansSettings() {
  const { t } = useTranslation();

  return (
    <>
      <SettingsPanel
        titleKey="page.settings.plans.title"
        descriptionKey="page.settings.plans.description"
      />
      <ComingSoon
        title={t("plans.comingSoon.title")}
        description={t("plans.comingSoon.description")}
        data-testid="plans-coming-soon"
      >
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-ink-subtle text-xs">
                  {t("plans.preview.current")}
                </span>
                <Placeholder className="h-3 w-28" />
              </div>
              <Tag size="sm" variant="neutral">
                {t("plans.preview.change")}
              </Tag>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-ink-subtle text-xs">
                  {t("plans.preview.usage")}
                </span>
                <Placeholder className="w-16" />
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay/10">
                <div className="h-full w-2/5 rounded-full bg-overlay/25" />
              </div>
            </div>
          </Card>
          <Card className="flex flex-col gap-4">
            <span className="font-semibold text-base text-ink-strong">
              {t("plans.preview.invoices")}
            </span>
            <div className="-mx-6 divide-y divide-overlay/10 border-overlay/10 border-y">
              {["w-24", "w-20", "w-28"].map((width) => (
                <div
                  key={width}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <Placeholder className={width} />
                  <Placeholder className="w-14" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </ComingSoon>
    </>
  );
}
