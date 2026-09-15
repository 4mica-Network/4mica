import { links } from "@4mica/url";

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
  root: links.root,
  app: links.app,
  docs: links.docs,
  support: links.email.support,
  /**
   * Pinned to the production origin rather than `links.website`, which follows
   * `NEXT_PUBLIC_BASE_URL` — a localhost base would render a broken image in
   * every recipient's inbox. `EMAIL_LOGO_URL` exists so `email:preview` can
   * point at the copy it serves itself from `emails/static/`.
   */
  logoUrl: process.env.EMAIL_LOGO_URL?.trim() || links.assets.logo,
} as const;

/**
 * The human the relationship emails come from. Onboarding and waitlist mail is
 * written in his voice and signed by him; transactional mail (receipts,
 * payouts, disputes) stays in the product's voice, where a personal signature
 * would read as a form letter pretending not to be one.
 *
 * `fromName` only changes the From display name — the sending address stays
 * `EMAIL_FROM_ADDRESS`, so this needs no extra mailbox or DNS.
 */
export const sender = {
  firstName: "Mairon",
  fullName: "Mairon Mahzoun",
  role: `CTO & co-founder, ${brand.name}`,
  fromName: `Mairon from ${brand.name}`,
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

/**
 * The one stylesheet that cannot be delivered inline.
 *
 * `react-email`'s `Body` forwards only `background`/`backgroundColor` to the
 * real `<body>`, zeroes its margins, and applies the rest of `styles.body` to a
 * `<td>` inside a wrapper table — so `height: 100%` set inline never reaches
 * the elements that need it. The height chain and the mobile breakpoint are
 * therefore expressed here and injected into `<head>` by `Layout`.
 *
 * Everything is scoped to `max-width: 600px`, so desktop is untouched. Gmail
 * strips `<html>`/`<body>` and their styles, so the height chain does not apply
 * there; the white background on the body and its wrapper `<td>` is the
 * fallback that keeps the card reading as full-bleed either way.
 */
export const responsiveCss = `
@media only screen and (max-width: 600px) {
  html, body {
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body { background-color: ${palette.surface} !important; }
  body > table { height: 100% !important; }
  body > table > tbody > tr > td {
    background-color: ${palette.surface} !important;
    height: 100% !important;
    padding: 0 !important;
    vertical-align: top !important;
  }
  .mica-card {
    border: 0 !important;
    border-radius: 0 !important;
    height: 100% !important;
    max-width: 100% !important;
    width: 100% !important;
  }
  /* A td defaults to vertical-align: middle, which would float the content in
     the middle of the now full-height card. */
  .mica-card > tbody > tr > td {
    padding: 24px 20px !important;
    vertical-align: top !important;
  }
}
`;

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
