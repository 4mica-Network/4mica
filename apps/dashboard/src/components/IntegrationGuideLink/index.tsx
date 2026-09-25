import { Tag, Tooltip } from "@4mica/ui";
import { useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { links } from "@/lib/links";
import {
  hasGeneratedHandle,
  isProfileRenderable,
  profileHiddenReason,
} from "@/lib/profile-gate";

export interface IntegrationGuideLinkProps {
  kind: "api" | "agent";
  ref: string;
  visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
  isPayable: boolean;
  "data-testid"?: string;
}

export function IntegrationGuideLink({
  kind,
  ref: listingRef,
  visibility,
  isPayable,
  "data-testid": testId,
}: IntegrationGuideLinkProps) {
  const { t } = useTranslation();
  const user = useAppSelector(selectUser);

  const renderable = isProfileRenderable(user);
  const hiddenReason = profileHiddenReason(user);

  if (!renderable) {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
        <span className="text-ink-subtle text-sm">
          {t("integration.guide.cta")}
        </span>
        <Tag size="sm" variant="neutral">
          {hiddenReason === "no-username"
            ? t("integration.guide.noHandle")
            : hiddenReason === "banned"
              ? t("integration.guide.profileUnavailable")
              : t("integration.guide.profilePrivate")}
        </Tag>
        {hiddenReason !== "banned" && (
          <Link
            className="text-accent text-sm underline-offset-2 hover:underline"
            data-testid={testId ? `${testId}-settings` : undefined}
            to="/settings/account"
          >
            {t("integration.guide.profilePrivateCta")}
          </Link>
        )}
      </div>
    );
  }

  const base = links.profile(user?.username ?? "");
  const href =
    kind === "api"
      ? `${base}/api/${encodeURIComponent(listingRef)}`
      : `${base}/agents/${encodeURIComponent(listingRef)}`;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <a
        className="inline-flex items-center gap-1.5 text-accent text-sm underline-offset-2 hover:underline"
        data-testid={testId ? `${testId}-link` : undefined}
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {t("integration.guide.cta")}
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </a>

      {/* A private row still resolves for its owner — the playground widens
          visibility when the viewer owns the profile — so the link works, but
          only for them. */}
      {visibility === "PRIVATE" && (
        <Tooltip content={t("integration.guide.previewOnlyHint")}>
          <Tag size="sm" variant="neutral">
            {t("integration.guide.previewOnly")}
          </Tag>
        </Tooltip>
      )}

      {!isPayable && (
        <Tooltip content={t("integration.guide.notPayableHint")}>
          <Tag size="sm" variant="warning">
            {t("integration.guide.notPayable")}
          </Tag>
        </Tooltip>
      )}

      {hasGeneratedHandle(user) && (
        <Tag size="sm" variant="neutral">
          {t("integration.guide.generatedHandle")}
        </Tag>
      )}
    </div>
  );
}
