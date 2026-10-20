import type { Option } from "@4mica/ui";
import { BUSINESS_TYPE } from "@stores/user/type";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export const useBusinessTypeOptions = (): Option[] => {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { title: t("settings.business.types.none"), value: "" },
      ...Object.values(BUSINESS_TYPE).map((value) => ({
        title: t(`settings.business.types.${value}`),
        value,
      })),
    ],
    [t],
  );
};
