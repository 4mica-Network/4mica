import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MASK, usePrivacy } from "@/hooks/usePrivacy";

export function Masked({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { hidden } = usePrivacy();

  if (!hidden) {
    return <>{children}</>;
  }

  return (
    <span data-masked="">
      <span aria-hidden="true">{MASK}</span>
      <span className="sr-only">{t("privacy.hidden")}</span>
    </span>
  );
}
