import { cityMapping } from "city-timezones";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface CityTimezone {
  city: string;
  timezone: string;
  pop: number;
  gmtOffset: string;
}

const FALLBACK_OFFSET = "GMT±00:00";

const applyOverrides = (city: CityTimezone): CityTimezone => {
  if (city.city === "London") {
    return { ...city, timezone: "Europe/London" };
  }
  if (city.city === "Londonderry") {
    return { ...city, city: "London" };
  }
  return city;
};

const offsetMinutes = (zone: string): number | null => {
  try {
    return dayjs().tz(zone).utcOffset();
  } catch {
    return null;
  }
};

export const formatGMTOffset = (minutes: number | null): string => {
  if (minutes === null) return FALLBACK_OFFSET;
  const hours = Math.floor(Math.abs(minutes) / 60)
    .toString()
    .padStart(2, "0");
  const rest = (Math.abs(minutes) % 60).toString().padStart(2, "0");
  const sign = minutes >= 0 ? "+" : "-";
  return `GMT${sign}${hours}:${rest}`;
};

export const buildCityTimezones = (): CityTimezone[] => {
  const topCities = cityMapping.reduce<Record<string, CityTimezone>>(
    (acc, city) => {
      if (!city.timezone) return acc;
      const existing = acc[city.timezone];
      if (!existing || city.pop > existing.pop) {
        acc[city.timezone] = {
          city: city.city,
          timezone: city.timezone,
          pop: city.pop,
          gmtOffset: "",
        };
      }
      return acc;
    },
    {},
  );

  return Object.values(topCities)
    .map(applyOverrides)
    .map((city) => ({ city, minutes: offsetMinutes(city.timezone) }))
    .sort(
      (a, b) =>
        (a.minutes ?? 0) - (b.minutes ?? 0) ||
        a.city.city.localeCompare(b.city.city),
    )
    .map(({ city, minutes }) => ({
      ...city,
      gmtOffset: formatGMTOffset(minutes),
    }));
};
