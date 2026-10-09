import { useTitle } from "ahooks";
import { useTranslation } from "react-i18next";

export const usePageTitle = (title: string): void => {
  const { t } = useTranslation();
  useTitle(`${title} - ${t("org")}`);
};
