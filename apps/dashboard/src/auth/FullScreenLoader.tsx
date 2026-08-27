import { useTranslation } from "react-i18next";

export function FullScreenLoader({ messageKey }: { messageKey: string }) {
  const { t } = useTranslation();

  return (
    <div className="grid min-h-screen place-items-center bg-surface-deep">
      <p className="text-ink-muted text-sm" role="status">
        {t(messageKey)}
      </p>
    </div>
  );
}
