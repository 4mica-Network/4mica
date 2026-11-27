import { Button, EmptyState } from "@4mica/ui";
import { RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { isChunkLoadError } from "@/lib/chunkReload";
import type { FallbackProps } from "./index";

const reload = () => window.location.reload();

function ChunkFailure({ className }: { className?: string }) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      reload();
    }
  }, [online]);

  if (!online) {
    return (
      <EmptyState
        className={className}
        icon={<WifiOff className="h-5 w-5" />}
        title={t("crash.offline.title")}
        description={t("crash.offline.description")}
        data-testid="crash-offline"
      />
    );
  }

  return (
    <EmptyState
      className={className}
      icon={<RefreshCw className="h-5 w-5" />}
      title={t("crash.newVersion.title")}
      description={t("crash.newVersion.description")}
      action={{ label: t("crash.reload"), onClick: reload }}
      data-testid="crash-new-version"
    />
  );
}

function CrashMessage({
  error,
  reset,
  className,
}: FallbackProps & { className?: string }) {
  const { t } = useTranslation();

  if (isChunkLoadError(error)) {
    return <ChunkFailure className={className} />;
  }

  return (
    <EmptyState
      className={className}
      icon={<TriangleAlert className="h-5 w-5" />}
      title={t("crash.title")}
      description={t("crash.description")}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" size="sm" intent="invert" onClick={reset}>
            {t("crash.retry")}
          </Button>
          <Button type="button" size="sm" intent="ghost" onClick={reload}>
            {t("crash.reload")}
          </Button>
        </div>
      }
      data-testid="crash"
    />
  );
}

export function PageCrash(props: FallbackProps) {
  return <CrashMessage {...props} className="flex-1" />;
}

export function AppCrash(props: FallbackProps) {
  return (
    <div className="grid min-h-dvh place-items-center bg-surface-deep p-6">
      <CrashMessage {...props} />
    </div>
  );
}
