import type { ReactNode } from "react";
import { Link } from "react-email";
import { brand, palette } from "./theme";

/**
 * The opt-out line every drip email carries, for `Layout`'s `footerNote`.
 *
 * A function rather than a component on purpose: `Layout` renders `footerNote`
 * behind a truthiness check, and a component element is always truthy — so a
 * component returning `null` would still print an empty paragraph and a stray
 * divider. Returning `undefined` lets that check do its job.
 */
export const unsubscribeNote = (href?: string): ReactNode | undefined =>
  href ? (
    <>
      You are receiving this because you signed up for {brand.name}.{" "}
      <Link href={href} style={{ color: palette.muted }}>
        Unsubscribe from onboarding emails
      </Link>
      .
    </>
  ) : undefined;
