import { Button } from "@4mica/ui";
import { toMessage } from "@utils/http-errors";
import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { notifyError } from "@/lib/notify";

export function ExportCsvButton({
  onExport,
  label,
  disabled,
  "data-testid": testId,
}: {
  onExport: () => Promise<void>;
  label?: string;
  disabled?: boolean;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onExport();
    } catch (error) {
      notifyError({
        title: t("export.failedTitle"),
        content: toMessage(error, t("export.failedBody")),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      intent="outline"
      size="sm"
      className="btn-no-lift"
      icon={<Download aria-hidden="true" className="h-4 w-4" />}
      loading={busy}
      disabled={disabled}
      onClick={run}
      data-testid={testId}
    >
      {label ?? t("export.csv")}
    </Button>
  );
}
