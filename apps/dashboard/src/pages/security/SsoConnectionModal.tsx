import { Button, Checkbox, Modal, Segmented } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import type { OrganizationRole } from "@stores/organization/type";
import {
  clearSecurityFailure,
  runSecurityOp,
  securityPendingKeys,
  selectIsSecurityPending,
  selectSecurityFailure,
} from "@stores/security";
import {
  type OrganizationDomain,
  SSO_PROVIDERS,
  type SsoConnectionInput,
  type SsoProvider,
} from "@stores/security/type";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, Select, TextArea, TextInput } from "@/components/form";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { AUTO_JOIN_ROLES } from "./DomainsSection";

export interface SsoDraft {
  domainId: string;
  provider: SsoProvider;
  name: string;
  mode: "metadata" | "manual";
  idpMetadataUrl: string;
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificate: string;
  defaultRole: OrganizationRole;
  jitProvisioning: boolean;
}

export const emptySsoDraft = (domainId: string): SsoDraft => ({
  domainId,
  provider: "OKTA",
  name: "",
  mode: "metadata",
  idpMetadataUrl: "",
  idpEntityId: "",
  idpSsoUrl: "",
  idpCertificate: "",
  defaultRole: "VIEWER",
  jitProvisioning: true,
});

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export const validateSsoDraft = (
  draft: SsoDraft,
  t: (key: string) => string,
): Partial<Record<keyof SsoDraft, string>> => {
  const errors: Partial<Record<keyof SsoDraft, string>> = {};
  if (!draft.domainId) {
    errors.domainId = t("security.sso.errors.domain");
  }
  if (!draft.name.trim()) {
    errors.name = t("security.sso.errors.name");
  }
  if (draft.mode === "metadata") {
    if (!isHttpsUrl(draft.idpMetadataUrl.trim())) {
      errors.idpMetadataUrl = t("security.sso.errors.url");
    }
  } else {
    if (!draft.idpEntityId.trim()) {
      errors.idpEntityId = t("security.sso.errors.entityId");
    }
    if (!isHttpsUrl(draft.idpSsoUrl.trim())) {
      errors.idpSsoUrl = t("security.sso.errors.url");
    }
    if (!draft.idpCertificate.includes("BEGIN CERTIFICATE")) {
      errors.idpCertificate = t("security.sso.errors.certificate");
    }
  }
  return errors;
};

export const toSsoInput = (draft: SsoDraft): SsoConnectionInput => ({
  domainId: draft.domainId,
  provider: draft.provider,
  name: draft.name.trim(),
  defaultRole: draft.defaultRole,
  jitProvisioning: draft.jitProvisioning,
  ...(draft.mode === "metadata"
    ? { idpMetadataUrl: draft.idpMetadataUrl.trim() }
    : {
        idpEntityId: draft.idpEntityId.trim(),
        idpSsoUrl: draft.idpSsoUrl.trim(),
        idpCertificate: draft.idpCertificate.trim(),
      }),
});

export function SsoConnectionModal({
  isOpen,
  domains,
  onClose,
}: {
  isOpen: boolean;
  domains: OrganizationDomain[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const key = securityPendingKeys.op("createSso");
  const isSaving = useAppSelector(selectIsSecurityPending(key));
  const failure = useAppSelector(selectSecurityFailure(key));
  const [draft, setDraft] = useState(() => emptySsoDraft(domains[0]?.id ?? ""));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(emptySsoDraft(domains[0]?.id ?? ""));
      setSubmitted(false);
      dispatch(clearSecurityFailure());
    }
  }, [isOpen, domains, dispatch]);

  useOnSuccess(isSaving, failure !== null, onClose);

  const set = <K extends keyof SsoDraft>(name: K, value: SsoDraft[K]) =>
    setDraft((current) => ({ ...current, [name]: value }));
  const errors = validateSsoDraft(draft, t);
  const shown = (name: keyof SsoDraft) =>
    submitted ? (errors[name] ?? failure?.issues[name]) : failure?.issues[name];

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length === 0) {
      dispatch(runSecurityOp({ op: "createSso", data: toSsoInput(draft) }));
    }
  };

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen={isOpen}
      onClose={onClose}
      title={t("security.sso.createTitle")}
      description={t("security.sso.createDescription")}
      data-testid="sso-modal"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button intent="ghost" size="sm" onClick={onClose}>
            {t("confirm.cancel")}
          </Button>
          <Button
            intent="invert"
            size="sm"
            className="btn-no-lift min-w-24 text-sm"
            loading={isSaving}
            onClick={submit}
            data-testid="sso-modal-submit"
          >
            {t("security.sso.create")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col">
        {failure?.code === "sso_unavailable" && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-ink-body text-sm"
            data-testid="sso-unavailable"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            />
            <p>{t("security.sso.unavailable")}</p>
          </div>
        )}

        <FieldRow title={t("security.sso.fields.domain")} htmlFor="sso-domain">
          <Select
            id="sso-domain"
            value={draft.domainId}
            error={shown("domainId")}
            options={domains.map((domain) => ({
              value: domain.id,
              title: domain.domain,
            }))}
            onChange={(value) => set("domainId", value)}
          />
        </FieldRow>

        <FieldRow
          title={t("security.sso.fields.provider")}
          description={t(`security.sso.provider.${draft.provider}.hint`)}
          htmlFor="sso-provider"
        >
          <Select
            id="sso-provider"
            value={draft.provider}
            options={SSO_PROVIDERS.map((provider) => ({
              value: provider,
              title: t(`security.sso.provider.${provider}.title`),
            }))}
            onChange={(value) => set("provider", value as SsoProvider)}
          />
        </FieldRow>

        <FieldRow title={t("security.sso.fields.name")} htmlFor="sso-name">
          <TextInput
            id="sso-name"
            value={draft.name}
            maxLength={120}
            placeholder={t(`security.sso.provider.${draft.provider}.title`)}
            error={shown("name")}
            onChange={(value) => set("name", value)}
          />
        </FieldRow>

        <FieldRow title={t("security.sso.fields.mode")}>
          <Segmented
            label={t("security.sso.fields.mode")}
            value={draft.mode}
            options={[
              {
                value: "metadata" as const,
                label: t("security.sso.mode.metadata"),
              },
              {
                value: "manual" as const,
                label: t("security.sso.mode.manual"),
              },
            ]}
            onChange={(value) => set("mode", value)}
          />
        </FieldRow>

        {draft.mode === "metadata" ? (
          <FieldRow
            title={t("security.sso.fields.metadataUrl")}
            description={t("security.sso.fields.metadataUrlHint")}
            htmlFor="sso-metadata-url"
          >
            <TextInput
              id="sso-metadata-url"
              type="url"
              value={draft.idpMetadataUrl}
              error={shown("idpMetadataUrl")}
              onChange={(value) => set("idpMetadataUrl", value)}
            />
          </FieldRow>
        ) : (
          <>
            <FieldRow
              title={t("security.sso.fields.entityId")}
              htmlFor="sso-entity-id"
            >
              <TextInput
                id="sso-entity-id"
                value={draft.idpEntityId}
                error={shown("idpEntityId")}
                onChange={(value) => set("idpEntityId", value)}
              />
            </FieldRow>
            <FieldRow
              title={t("security.sso.fields.ssoUrl")}
              htmlFor="sso-sso-url"
            >
              <TextInput
                id="sso-sso-url"
                type="url"
                value={draft.idpSsoUrl}
                error={shown("idpSsoUrl")}
                onChange={(value) => set("idpSsoUrl", value)}
              />
            </FieldRow>
            <FieldRow
              title={t("security.sso.fields.certificate")}
              description={t("security.sso.fields.certificateHint")}
              htmlFor="sso-certificate"
            >
              <TextArea
                id="sso-certificate"
                rows={5}
                spellCheck={false}
                value={draft.idpCertificate}
                placeholder="-----BEGIN CERTIFICATE-----"
                error={shown("idpCertificate")}
                onChange={(value) => set("idpCertificate", value)}
              />
            </FieldRow>
          </>
        )}

        <FieldRow
          title={t("security.sso.fields.defaultRole")}
          description={t("security.sso.fields.defaultRoleHint")}
          htmlFor="sso-default-role"
        >
          <Select
            id="sso-default-role"
            value={draft.defaultRole}
            options={AUTO_JOIN_ROLES.map((role) => ({
              value: role,
              title: t(`organization.role.${role}`),
            }))}
            onChange={(value) => set("defaultRole", value as OrganizationRole)}
          />
        </FieldRow>

        <div className="pt-3">
          <Checkbox
            variant="square"
            checked={draft.jitProvisioning}
            onChange={(on) => set("jitProvisioning", on)}
            data-testid="sso-jit"
          >
            <span className="flex flex-col">
              <span className="font-medium text-ink-strong text-sm">
                {t("security.sso.fields.jit")}
              </span>
              <span className="text-ink-muted text-xs">
                {t("security.sso.fields.jitHint")}
              </span>
            </span>
          </Checkbox>
        </div>
      </div>
    </Modal>
  );
}
