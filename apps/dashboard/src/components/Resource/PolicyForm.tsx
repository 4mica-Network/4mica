import { isWebUrl } from "@4mica/rules";
import { InputField } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import type { ResourceRef } from "@stores/shared/type";
import { savePolicy } from "@stores/trust/actions";
import {
  selectIsTrustPending,
  selectPolicy,
  selectTrustIssues,
} from "@stores/trust/selector";
import type { PolicyInput } from "@stores/trust/type";
import { hasErrors, isEmail } from "@utils/validation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EditableCard } from "@/components/EditableCard";
import { useDraft } from "@/hooks/useDraft";

type PolicyFieldKey =
  | "refundPolicy"
  | "uptimeTarget"
  | "supportResponse"
  | "supportEmail"
  | "rateLimit"
  | "dataRetention"
  | "testEndpoint"
  | "termsUrl"
  | "privacyUrl"
  | "statusUrl";

type PolicyFieldKind = "multiline" | "short" | "email" | "url";

const MAX_LENGTH: Record<PolicyFieldKind, number> = {
  multiline: 2000,
  short: 120,
  email: 320,
  url: 2048,
};

const FIELDS: { key: PolicyFieldKey; kind: PolicyFieldKind }[] = [
  { key: "refundPolicy", kind: "multiline" },
  { key: "uptimeTarget", kind: "short" },
  { key: "supportResponse", kind: "short" },
  { key: "supportEmail", kind: "email" },
  { key: "rateLimit", kind: "short" },
  { key: "dataRetention", kind: "multiline" },
  { key: "testEndpoint", kind: "url" },
  { key: "termsUrl", kind: "url" },
  { key: "privacyUrl", kind: "url" },
  { key: "statusUrl", kind: "url" },
];

export function PolicyForm({ resource }: { resource: ResourceRef }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const policy = useAppSelector(selectPolicy);
  const issues = useAppSelector(selectTrustIssues);
  const isSaving = useAppSelector(selectIsTrustPending("savePolicy"));

  const initial = useMemo(
    () =>
      Object.fromEntries(
        FIELDS.map(({ key }) => [key, policy?.[key] ?? ""]),
      ) as Record<PolicyFieldKey, string>,
    [policy],
  );

  const { draft, set, changes, isDirty, reset } = useDraft(initial);

  const errors = Object.fromEntries(
    FIELDS.map(({ key, kind }) => {
      const value = draft[key].trim();
      if (value === "") {
        return [key, undefined];
      }
      if (value.length > MAX_LENGTH[kind]) {
        return [key, t("validation.tooLong", { max: MAX_LENGTH[kind] })];
      }
      if (kind === "email" && !isEmail(value)) {
        return [key, t("validation.email")];
      }
      if (kind === "url" && !isWebUrl(value)) {
        return [key, t("validation.webUrl")];
      }
      return [key, undefined];
    }),
  ) as Record<PolicyFieldKey, string | undefined>;

  const save = () => {
    const payload: PolicyInput = {};
    for (const key of Object.keys(changes) as PolicyFieldKey[]) {
      payload[key] = draft[key].trim() === "" ? null : draft[key].trim();
    }
    dispatch(savePolicy(resource, payload));
  };

  return (
    <EditableCard
      isDirty={isDirty}
      isInvalid={hasErrors(errors)}
      isSaving={isSaving}
      onReset={reset}
      onSave={save}
    >
      <div className="flex flex-col divide-y divide-overlay/10">
        {FIELDS.map(({ key, kind }) => (
          <div className="py-3 first:pt-0 last:pb-0" key={key}>
            <label
              className="font-medium text-ink-strong text-sm"
              htmlFor={`policy-${key}`}
            >
              {t(`appDetail.policy.${key}`)}
            </label>
            <div className="mt-2">
              <InputField
                error={errors[key] ?? issues[key]}
                id={`policy-${key}`}
                maxLength={MAX_LENGTH[kind]}
                onChange={(event) => set(key, event.target.value)}
                placeholder={t(`appDetail.policyHint.${key}`)}
                value={draft[key]}
                {...(kind === "multiline"
                  ? ({ variant: "textarea", rows: 3 } as const)
                  : ({ variant: "input" } as const))}
              />
            </div>
          </div>
        ))}
      </div>
    </EditableCard>
  );
}
