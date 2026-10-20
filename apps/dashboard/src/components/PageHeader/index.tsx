import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/usePageTitle";

export function PageHeader({
  titleKey,
  descriptionKey,
}: {
  titleKey: string;
  descriptionKey?: string;
}) {
  const { t } = useTranslation();
  const title = t(titleKey);
  usePageTitle(title);
  return (
    <div className="mb-6">
      <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
        {title}
      </h1>
      {descriptionKey && (
        <p className="mt-1 text-ink-muted text-sm">{t(descriptionKey)}</p>
      )}
    </div>
  );
}
