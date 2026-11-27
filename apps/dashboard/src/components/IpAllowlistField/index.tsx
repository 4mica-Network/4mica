import { allowlistError, parseAllowlist } from "@utils/ipAllowlist";
import { useTranslation } from "react-i18next";
import { FieldRow, TextArea } from "@/components/form";

export function IpAllowlistField({
  id,
  value,
  onChange,
  disabled,
  title,
  description,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
  description?: string;
}) {
  const { t } = useTranslation();
  const error = allowlistError(parseAllowlist(value), t);

  return (
    <FieldRow
      title={title ?? t("ipAllowlist.title")}
      description={description ?? t("ipAllowlist.hint")}
      htmlFor={id}
    >
      <TextArea
        id={id}
        value={value}
        rows={3}
        spellCheck={false}
        placeholder={t("ipAllowlist.placeholder")}
        disabled={disabled}
        error={error}
        onChange={onChange}
      />
    </FieldRow>
  );
}
