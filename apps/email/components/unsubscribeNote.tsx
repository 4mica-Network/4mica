import type { ReactNode } from "react";
import { Link } from "react-email";
import { brand, palette } from "./theme";

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
