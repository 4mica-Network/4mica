import { Button, Card, Tag } from "@4mica/ui";
import { useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ComingSoon, Placeholder } from "@/components/ComingSoon";
import { SettingsPanel } from "@/components/SettingsPanel";

function MemberRow({
  name,
  role,
  you,
}: {
  name?: string;
  role: string;
  you?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <span className="h-8 w-8 shrink-0 rounded-full bg-overlay/10" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {name ? (
          <span className="truncate font-medium text-ink-strong text-sm">
            {name}
            {you && (
              <span className="ml-1.5 font-normal text-ink-subtle">
                {t("team.preview.you")}
              </span>
            )}
          </span>
        ) : (
          <Placeholder className="w-32" />
        )}
        <Placeholder className="w-44" />
      </div>
      <Tag size="sm" variant="neutral">
        {role}
      </Tag>
    </div>
  );
}

export function TeamSettings() {
  const { t } = useTranslation();
  const user = useAppSelector(selectUser);

  return (
    <>
      <SettingsPanel
        titleKey="page.settings.team.title"
        descriptionKey="page.settings.team.description"
      />
      <ComingSoon
        title={t("team.comingSoon.title")}
        description={t("team.comingSoon.description")}
        data-testid="team-coming-soon"
      >
        <Card className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-base text-ink-strong">
                {t("team.preview.members")}
              </span>
              <Placeholder className="w-56" />
            </div>
            <Button
              size="sm"
              intent="invert"
              icon={<UserPlus className="h-4 w-4" />}
              tabIndex={-1}
            >
              {t("team.preview.invite")}
            </Button>
          </div>
          <div className="-mx-6 divide-y divide-overlay/10 border-overlay/10 border-y">
            <MemberRow
              name={user?.name || user?.email || undefined}
              role={t("team.preview.owner")}
              you
            />
            <MemberRow role={t("team.preview.admin")} />
            <MemberRow role={t("team.preview.member")} />
          </div>
        </Card>
      </ComingSoon>
    </>
  );
}
