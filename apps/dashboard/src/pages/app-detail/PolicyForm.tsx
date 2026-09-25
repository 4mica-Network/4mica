import { Button, InputField } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { savePolicy } from "@stores/trust/actions";
import {
  selectIsTrustPending,
  selectPolicy,
  selectTrustIssues,
} from "@stores/trust/selector";
import type { PolicyInput } from "@stores/trust/type";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const EMPTY: PolicyInput = {
  refundPolicy: "",
  uptimeTarget: "",
  supportResponse: "",
  supportEmail: "",
  rateLimit: "",
  dataRetention: "",
  testEndpoint: "",
  termsUrl: "",
  privacyUrl: "",
  statusUrl: "",
};

const FIELDS = [
  { key: "refundPolicy", multiline: true },
  { key: "dataRetention", multiline: true },
  { key: "uptimeTarget", multiline: false },
  { key: "supportResponse", multiline: false },
  { key: "supportEmail", multiline: false },
  { key: "rateLimit", multiline: false },
  { key: "testEndpoint", multiline: false },
  { key: "termsUrl", multiline: false },
  { key: "privacyUrl", multiline: false },
  { key: "statusUrl", multiline: false },
] as const satisfies readonly { key: keyof PolicyInput; multiline: boolean }[];

export function PolicyForm({
  kind,
  id,
}: {
  kind: "listing" | "agent";
  id: string;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const policy = useAppSelector(selectPolicy);
  const issues = useAppSelector(selectTrustIssues);
  const isSaving = useAppSelector(selectIsTrustPending("savePolicy"));

  const [values, setValues] = useState<PolicyInput>(EMPTY);

  useEffect(() => {
    if (!policy) {
      setValues(EMPTY);
      return;
    }

    setValues({
      refundPolicy: policy.refundPolicy ?? "",
      uptimeTarget: policy.uptimeTarget ?? "",
      supportResponse: policy.supportResponse ?? "",
      supportEmail: policy.supportEmail ?? "",
      rateLimit: policy.rateLimit ?? "",
      dataRetention: policy.dataRetention ?? "",
      testEndpoint: policy.testEndpoint ?? "",
      termsUrl: policy.termsUrl ?? "",
      privacyUrl: policy.privacyUrl ?? "",
      statusUrl: policy.statusUrl ?? "",
    });
  }, [policy]);

  const set = (key: keyof PolicyInput, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    dispatch(savePolicy({ kind, id }, values));
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="text-ink-muted text-sm">{t("appDetail.policyLead")}</p>

      {FIELDS.map(({ key, multiline }) => (
        <InputField
          error={issues[key]}
          key={key}
          label={t(`appDetail.policy.${key}`)}
          maxLength={multiline ? 2000 : 320}
          onChange={(event) => set(key, event.target.value)}
          placeholder={t(`appDetail.policyHint.${key}`)}
          value={values[key] ?? ""}
          {...(multiline
            ? ({ variant: "textarea", rows: 3 } as const)
            : ({ variant: "input" } as const))}
        />
      ))}

      <Button className="self-start" disabled={isSaving} type="submit">
        {t("appDetail.savePolicy")}
      </Button>
    </form>
  );
}
