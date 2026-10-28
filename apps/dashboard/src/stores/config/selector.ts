import type { RootState } from "@stores/index";
import type { AppConfig, CityTimezone, ConfigState, Country } from "./type";

const NONE: string[] = [];
const NO_COUNTRIES: Country[] = [];
const NO_TIMEZONES: CityTimezone[] = [];

export const selectConfigState = (state: RootState): ConfigState =>
  state.config;

export const selectConfig = (state: RootState): AppConfig | null =>
  state.config.config;

export const selectCountries = (state: RootState): Country[] =>
  state.config.config?.countries ?? NO_COUNTRIES;

export const selectTimezones = (state: RootState): CityTimezone[] =>
  state.config.config?.timezones ?? NO_TIMEZONES;

export const selectConfigList =
  (key: Exclude<keyof AppConfig, "version" | "countries" | "timezones">) =>
  (state: RootState): string[] =>
    state.config.config?.[key] ?? NONE;
