import { cityMapping } from "city-timezones";

export interface Country {
  code: string;
  name: string;
}

export const buildCountries = (): Country[] => {
  const byCode = new Map<string, string>();
  for (const { iso2, country } of cityMapping) {
    if (iso2 && country && !byCode.has(iso2)) {
      byCode.set(iso2, country);
    }
  }
  return [...byCode]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
