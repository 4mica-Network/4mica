import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  if (online) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center font-medium text-sm text-surface-deep"
      data-testid="offline-banner"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{t("offline.banner")}</span>
    </div>
  );
}
