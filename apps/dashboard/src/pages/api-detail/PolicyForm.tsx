import { InputField } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import type { ResourceRef } from "@stores/trust/actions";
import { savePolicy } from "@stores/trust/actions";
import {
  selectIsTrustPending,
  selectPolicy,
  selectTrustIssues,
} from "@stores/trust/selector";
import type { PolicyInput } from "@stores/trust/type";
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

const FIELDS: { key: PolicyFieldKey; multiline: boolean }[] = [
  { key: "refundPolicy", multiline: true },
  { key: "uptimeTarget", multiline: false },
  { key: "supportResponse", multiline: false },
  { key: "supportEmail", multiline: false },
  { key: "rateLimit", multiline: false },
  { key: "dataRetention", multiline: true },
  { key: "testEndpoint", multiline: false },
  { key: "termsUrl", multiline: false },
  { key: "privacyUrl", multiline: false },
  { key: "statusUrl", multiline: false },
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
      isSaving={isSaving}
      onReset={reset}
      onSave={save}
    >
      <div className="flex flex-col divide-y divide-overlay/10">
        {FIELDS.map(({ key, multiline }) => (
          <div className="py-3 first:pt-0 last:pb-0" key={key}>
            <label
              className="font-medium text-ink-strong text-sm"
              htmlFor={`policy-${key}`}
            >
              {t(`appDetail.policy.${key}`)}
            </label>
            <div className="mt-2">
              <InputField
                error={issues[key]}
                id={`policy-${key}`}
                maxLength={multiline ? 2000 : 320}
                onChange={(event) => set(key, event.target.value)}
                placeholder={t(`appDetail.policyHint.${key}`)}
                value={draft[key]}
                {...(multiline
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
