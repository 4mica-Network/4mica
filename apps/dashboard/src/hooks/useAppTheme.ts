import { useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { useEffect } from "react";
import {
  applyTheme,
  rememberThemePreference,
  resolveTheme,
  toThemePreference,
  watchSystemTheme,
} from "@/lib/theme";

export const useAppTheme = (): void => {
  const appTheme = useAppSelector(selectUser)?.appTheme;

  useEffect(() => {
    if (appTheme === undefined) {
      return;
    }

    const preference = toThemePreference(appTheme);
    const apply = () => applyTheme(resolveTheme(preference));

    rememberThemePreference(preference);
    apply();

    return preference === "system" ? watchSystemTheme(apply) : undefined;
  }, [appTheme]);
};
