import { useTranslation } from "react-i18next";
import { FieldRow, TextInput } from "@/components/form";

export function NameStep({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <p className="text-ink-muted text-sm">{t("onboarding.name.hint")}</p>

      <FieldRow
        title={t("onboarding.name.label")}
        htmlFor="onboarding-name"
        description={t("onboarding.name.description")}
      >
        <TextInput
          id="onboarding-name"
          value={value}
          onChange={onChange}
          placeholder={t("onboarding.name.placeholder")}
          error={error}
          maxLength={120}
        />
      </FieldRow>
    </div>
  );
}
