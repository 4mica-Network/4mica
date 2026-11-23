import { Spinner as UiSpinner } from "@4mica/ui";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

export function Spinner(props: ComponentProps<typeof UiSpinner>) {
  const { t } = useTranslation();
  return <UiSpinner title={t("loader.loading")} {...props} />;
}
