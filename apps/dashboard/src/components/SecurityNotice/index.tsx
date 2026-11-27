import { Button, Card, CopyButton, EmptyState } from "@4mica/ui";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ReadOnlyNotice({
  message,
  testId,
}: {
  message?: string;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3 text-ink-muted text-sm"
      data-testid={testId}
    >
      <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message ?? t("security.readOnly")}</p>
    </div>
  );
}

export function Unavailable({
  personal,
  testId,
}: {
  personal: boolean;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<Lock className="h-5 w-5" />}
      title={
        personal ? t("security.personal.title") : t("security.noAccess.title")
      }
      description={
        personal
          ? t("security.personal.description")
          : t("security.noAccess.description")
      }
      data-testid={testId}
    />
  );
}

export function OneTimeSecret({
  title,
  values,
  onDismiss,
  "data-testid": testId,
}: {
  title: string;
  values: { label: string; value: string; block?: boolean }[];
  onDismiss: () => void;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();
  return (
    <Card className="border-warning/40 bg-warning/5" data-testid={testId}>
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="font-semibold text-ink-strong text-sm">{title}</h4>
          <p className="mt-0.5 text-ink-muted text-xs">
            {t("security.secret.once")}
          </p>
        </div>
        {values.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-subtle text-xs">{item.label}</span>
              <CopyButton
                value={item.value}
                labels={{
                  copy: t("security.copy"),
                  copied: t("security.copied"),
                }}
              />
            </div>
            {item.block ? (
              <pre className="max-h-64 overflow-auto rounded-md border border-overlay/15 bg-surface-deep px-3 py-2 font-mono text-ink-body text-xs">
                {item.value}
              </pre>
            ) : (
              <code className="select-all break-all rounded-md border border-overlay/15 bg-surface-deep px-3 py-2 font-mono text-ink-body text-xs">
                {item.value}
              </code>
            )}
          </div>
        ))}
        <div className="flex justify-end">
          <Button type="button" size="sm" intent="ghost" onClick={onDismiss}>
            {t("security.secret.dismiss")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
