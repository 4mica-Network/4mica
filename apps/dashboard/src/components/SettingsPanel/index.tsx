import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/usePageTitle";

export function SettingsPanel({
  titleKey,
  descriptionKey,
}: {
  titleKey: string;
  descriptionKey: string;
}) {
  const { t } = useTranslation();
  const title = t(titleKey);
  usePageTitle(title);
  return (
    <section className="mx-auto w-full lg:max-w-3xl">
      <h2 className="font-semibold text-ink-strong text-lg">{title}</h2>
      <p className="mt-1 text-ink-muted text-sm">{t(descriptionKey)}</p>
    </section>
  );
}
