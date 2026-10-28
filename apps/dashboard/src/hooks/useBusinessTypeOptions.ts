import type { Option } from "@4mica/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedConfigOptions } from "./useConfigOptions";

export const useBusinessTypeOptions = (): Option[] => {
  const { t } = useTranslation();
  const types = useTranslatedConfigOptions(
    "businessTypes",
    "settings.business.types",
  );
  return useMemo(
    () => [{ title: t("settings.business.types.none"), value: "" }, ...types],
    [t, types],
  );
};
