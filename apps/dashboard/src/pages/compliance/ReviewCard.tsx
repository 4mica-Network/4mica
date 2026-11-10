import { Button, Card } from "@4mica/ui";
import {
  compliancePendingKeys,
  submitCompliance,
} from "@stores/compliance/actions";
import {
  selectCompliance,
  selectIsCompliancePending,
} from "@stores/compliance/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { formatDate } from "@utils/format";
import { ArrowUpRight, Check, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { KybTag } from "@/components/badges";

const SECTION_FOR: Record<string, string> = {
  "profile.incorporation": "compliance-incorporation",
  "profile.operations": "compliance-operations",
  "profile.licence": "compliance-licensing",
  "profile.complianceOfficer": "compliance-aml",
  "profile.policies": "compliance-aml",
  "profile.fundsSource": "compliance-funds",
  owners: "compliance-people",
  "owners.control": "compliance-people",
  attestations: "compliance-attestations",
};

function Requirement({ requirement }: { requirement: string }) {
  const { t } = useTranslation();
  const label = t(`compliance.requirement.${requirement}`);

  if (requirement.startsWith("business.")) {
    return (
      <Link
        to="/settings/business"
        className="group inline-flex items-center gap-1.5 text-ink-body text-sm hover:text-ink-strong"
      >
        {label}
        <span className="text-ink-muted text-xs">
          {t("compliance.review.onBusinessPage")}
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="h-3.5 w-3.5 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      </Link>
    );
  }

  return (
    <a
      href={`#${SECTION_FOR[requirement] ?? ""}`}
      className="text-ink-body text-sm hover:text-ink-strong"
    >
      {label}
    </a>
  );
}

export function ReviewCard() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { kybStatus, missing, profile } = useAppSelector(selectCompliance);
  const isSubmitting = useAppSelector(
    selectIsCompliancePending(compliancePendingKeys.submit),
  );

  const canSubmit =
    (kybStatus === "UNVERIFIED" || kybStatus === "REJECTED") &&
    missing.length === 0;
  const showChecklist = kybStatus === "UNVERIFIED" || kybStatus === "REJECTED";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="font-medium text-ink-strong text-sm">
            {t("compliance.review.status")}
          </span>
          <p className="mt-0.5 text-ink-muted text-xs">
            {t(`compliance.review.statusHint.${kybStatus}`, {
              date: formatDate(profile?.submittedAt ?? null),
            })}
          </p>
        </div>
        <KybTag status={kybStatus} label={t(`settings.kyb.${kybStatus}`)} />
      </div>

      {showChecklist && (
        <div className="flex flex-col gap-3 pt-1">
          {missing.length > 0 ? (
            <>
              <span className="font-medium text-ink-muted text-xs">
                {t("compliance.review.stillNeeded")}
              </span>
              <ul className="flex flex-col gap-2">
                {missing.map((requirement) => (
                  <li key={requirement} className="flex items-center gap-2.5">
                    <Circle
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-ink-subtle"
                    />
                    <Requirement requirement={requirement} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="flex items-center gap-2 text-ink-body text-sm">
              <Check aria-hidden="true" className="h-4 w-4 text-success" />
              {t("compliance.review.ready")}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              intent="invert"
              className="btn-no-lift min-w-36 text-sm"
              loading={isSubmitting}
              disabled={!canSubmit}
              onClick={() => dispatch(submitCompliance())}
            >
              {kybStatus === "REJECTED"
                ? t("compliance.review.resubmit")
                : t("compliance.review.submit")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
