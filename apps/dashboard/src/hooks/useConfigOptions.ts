import type { Option } from "@4mica/ui";
import {
  selectConfigList,
  selectCountries,
  selectTimezones,
} from "@stores/config/selector";
import type { AppConfig } from "@stores/config/type";
import { useAppSelector } from "@stores/hooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type ConfigListKey = Exclude<
  keyof AppConfig,
  "version" | "countries" | "timezones"
>;

const asIs = (value: string) => value;

export const useConfigList = (key: ConfigListKey): string[] =>
  useAppSelector(useMemo(() => selectConfigList(key), [key]));

export const useConfigOptions = (
  key: ConfigListKey,
  label: (value: string) => string = asIs,
): Option[] => {
  const values = useConfigList(key);
  return useMemo(
    () => values.map((value) => ({ title: label(value), value })),
    [values, label],
  );
};

export const useTranslatedConfigOptions = (
  key: ConfigListKey,
  prefix: string,
): Option[] => {
  const { t } = useTranslation();
  const label = useMemo(
    () => (value: string) => t(`${prefix}.${value}`),
    [t, prefix],
  );
  return useConfigOptions(key, label);
};

export const useCountryOptions = (): Option[] => {
  const countries = useAppSelector(selectCountries);
  return useMemo(
    () =>
      countries.map(({ code, name }) => ({
        title: `${name} (${code})`,
        value: code,
      })),
    [countries],
  );
};

export const useTimezoneOptions = (): Option[] => {
  const timezones = useAppSelector(selectTimezones);
  return useMemo(
    () =>
      timezones.map(({ city, timezone }) => ({
        title: city,
        value: timezone,
      })),
    [timezones],
  );
};
