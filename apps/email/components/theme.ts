import { links, routes } from "@4mica/url";

/**
 * Inline styles rather than Tailwind classes: every mail client supports
 * inline CSS, and the desktop Outlook renderers still drop most of what a
 * utility framework emits.
 */
export const palette = {
  background: "#f5f6f8",
  surface: "#ffffff",
  border: "#e4e6eb",
  text: "#16181d",
  muted: "#606770",
  brand: "#1a4fd6",
  brandContrast: "#ffffff",
  positive: "#0f7b52",
  negative: "#b4231d",
} as const;

export const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const brand = {
  name: "4Mica",
  website: links.website,
  app: links.app,
  docs: links.docs,
  support: links.email.support,
  logoUrl: `${links.website}${routes.logo}`,
} as const;

export const styles = {
  body: {
    backgroundColor: palette.background,
    color: palette.text,
    fontFamily: fontStack,
    margin: 0,
    padding: "24px 0",
  },
  container: {
    backgroundColor: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: "12px",
    margin: "0 auto",
    maxWidth: "600px",
    padding: "32px",
  },
  heading: {
    fontSize: "22px",
    fontWeight: 700,
    lineHeight: "30px",
    margin: "0 0 16px",
  },
  paragraph: {
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  muted: {
    color: palette.muted,
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0 0 8px",
  },
  hr: {
    border: "none",
    borderTop: `1px solid ${palette.border}`,
    margin: "28px 0 20px",
  },
  table: {
    borderCollapse: "collapse" as const,
    width: "100%",
  },
  cell: {
    borderBottom: `1px solid ${palette.border}`,
    fontSize: "14px",
    padding: "10px 0",
  },
  cellRight: {
    borderBottom: `1px solid ${palette.border}`,
    fontSize: "14px",
    padding: "10px 0",
    textAlign: "right" as const,
  },
} as const;

/** `2500` + `USD` → `$25.00`. Falls back to `25.00 USD` for exotic codes. */
export const formatMoney = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
};

export const formatDate = (iso: string): string => {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
};
