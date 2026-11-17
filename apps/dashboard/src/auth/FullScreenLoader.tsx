import { Button } from "@4mica/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/Spinner";

export const SLOW_LOAD_MS = 12_000;

export function FullScreenLoader() {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="grid min-h-dvh place-items-center bg-surface-deep p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <Spinner size="lg" className="text-ink-subtle" />
        {slow ? (
          <div className="flex flex-col items-center gap-3" role="status">
            <p className="text-ink-muted text-sm">{t("loader.slow")}</p>
            <Button
              type="button"
              size="sm"
              intent="outline"
              onClick={() => window.location.reload()}
            >
              {t("crash.reload")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
