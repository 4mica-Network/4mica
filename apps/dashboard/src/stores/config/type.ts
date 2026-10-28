export interface Country {
  code: string;
  name: string;
}

export interface CityTimezone {
  city: string;
  timezone: string;
  pop: number;
  gmtOffset: string;
}

export interface AppConfig {
  version: string;
  countries: Country[];
  timezones: CityTimezone[];
  currencies: string[];
  languages: string[];
  themes: string[];
  homes: string[];
  notificationPlacements: string[];
  businessTypes: string[];
  monthlyVolumes: string[];
  customerBases: string[];
  fundsSources: string[];
  ownerRoles: string[];
  networks: string[];
}

export interface ConfigState {
  config: AppConfig | null;
  fetchedAt: number | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
}
