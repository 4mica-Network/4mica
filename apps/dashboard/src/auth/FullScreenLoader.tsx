import { Button } from "@4mica/ui";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/Spinner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export const SLOW_LOAD_MS = 12_000;

export function FullScreenLoader() {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  const online = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(!online);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
    } else if (wasOffline) {
      window.location.reload();
    }
  }, [online, wasOffline]);

  if (!online) {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface-deep p-6">
        <div
          className="flex max-w-sm flex-col items-center gap-4 text-center"
          role="status"
          data-testid="offline-startup"
        >
          <WifiOff aria-hidden="true" className="h-6 w-6 text-ink-subtle" />
          <p className="text-ink-muted text-sm">{t("offline.startup")}</p>
        </div>
      </div>
    );
  }

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
