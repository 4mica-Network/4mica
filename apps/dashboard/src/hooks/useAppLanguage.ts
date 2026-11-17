import { useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { useEffect } from "react";
import { applyLanguage } from "@/i18n";

export const useAppLanguage = (): void => {
  const language = useAppSelector(selectUser)?.language;

  useEffect(() => {
    if (language === undefined) {
      return;
    }
    applyLanguage(language).catch(() => {});
  }, [language]);
};
