/**
 * Locale and time zone are pinned. `toLocaleDateString()` with the ambient
 * locale renders differently on the server and in the browser, which is a real
 * hydration-mismatch source on a server-rendered page.
 */
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const FULL_DATE = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export const formatMonthYear = (iso: string): string =>
  MONTH_YEAR.format(new Date(iso));

export const formatDate = (iso: string): string =>
  FULL_DATE.format(new Date(iso));
