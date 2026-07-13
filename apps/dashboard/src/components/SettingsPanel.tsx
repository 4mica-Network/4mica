import { useTitle } from "ahooks";
import { useTranslation } from "react-i18next";

export function SettingsPanel({
  titleKey,
  descriptionKey,
}: {
  titleKey: string;
  descriptionKey: string;
}) {
  const { t } = useTranslation();
  const title = t(titleKey);
  useTitle(`${title} - ${t("org")}`);
  return (
    <section>
      <h2 className="font-semibold text-ink-strong text-lg">{title}</h2>
      <p className="mt-1 text-ink-muted text-sm">{t(descriptionKey)}</p>
    </section>
  );
}
