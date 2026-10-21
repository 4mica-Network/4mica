import {
  compliancePendingKeys,
  fetchCompliance,
  updateCompliance,
} from "@stores/compliance/actions";
import {
  selectComplianceIssues,
  selectComplianceProfile,
  selectHasLoadedCompliance,
  selectIsComplianceLoading,
  selectIsComplianceLocked,
} from "@stores/compliance/selector";
import {
  type ComplianceUpdate,
  CUSTOMER_BASE,
  type CustomerBase,
  FUNDS_SOURCE,
  type FundsSource,
  MONTHLY_VOLUME,
  type MonthlyVolume,
} from "@stores/compliance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import type { RootState } from "@stores/index";
import { blankFieldsToNull, formatDate } from "@utils/format";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EditableCard, InstantCard } from "@/components/EditableCard";
import {
  FieldRow,
  Select,
  SettingRow,
  SwitchCard,
  TextArea,
  TextInput,
} from "@/components/form";
import { SettingsSection } from "@/components/layout";
import { SettingsPage } from "@/components/SettingsPage";
import { useDraft } from "@/hooks/useDraft";
import { OwnersCard } from "./OwnersCard";
import { ReviewCard } from "./ReviewCard";
import {
  countryError,
  emailError,
  type FieldError,
  lengthError,
  parseRegions,
  pastDateError,
  regionsError,
  urlError,
} from "./validation";

const invalid = (errors: Record<string, FieldError | undefined>) =>
  Object.values(errors).some(Boolean);

const isSaving = (section: string) => (state: RootState) =>
  Boolean(state.compliance.pending[compliancePendingKeys.section(section)]);

export function ComplianceSettings() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector(selectComplianceProfile);
  const issues = useAppSelector(selectComplianceIssues);
  const locked = useAppSelector(selectIsComplianceLocked);
  const isLoading = useAppSelector(selectIsComplianceLoading);
  const hasLoaded = useAppSelector(selectHasLoadedCompliance);

  const savingIncorporation = useAppSelector(isSaving("incorporation"));
  const savingOperations = useAppSelector(isSaving("operations"));
  const savingRegions = useAppSelector(isSaving("regions"));
  const savingRegulated = useAppSelector(isSaving("isRegulated"));
  const savingLicence = useAppSelector(isSaving("licence"));
  const savingAmlPolicy = useAppSelector(isSaving("hasAmlPolicy"));
  const savingOfficer = useAppSelector(isSaving("officer"));
  const savingPolicies = useAppSelector(isSaving("policies"));
  const savingFunds = useAppSelector(isSaving("fundsSource"));
  const savingFundsDetail = useAppSelector(isSaving("fundsDetail"));
  const savingSanctions = useAppSelector(isSaving("sanctionsAttested"));
  const savingProhibited = useAppSelector(isSaving("prohibitedAttested"));
  const savingAccuracy = useAppSelector(isSaving("accuracyAttested"));
  const savingSigner = useAppSelector(isSaving("signer"));

  useEffect(() => {
    dispatch(fetchCompliance());
  }, [dispatch]);

  const incorporation = useDraft(
    useMemo(
      () => ({
        incorporationCountry: profile?.incorporationCountry ?? "",
        incorporatedOn: profile?.incorporatedOn ?? "",
      }),
      [profile],
    ),
  );
  const regions = useDraft(
    useMemo(
      () => ({ customerRegions: (profile?.customerRegions ?? []).join(", ") }),
      [profile],
    ),
  );
  const licence = useDraft(
    useMemo(
      () => ({
        licenceType: profile?.licenceType ?? "",
        licenceNumber: profile?.licenceNumber ?? "",
        regulator: profile?.regulator ?? "",
      }),
      [profile],
    ),
  );
  const officer = useDraft(
    useMemo(
      () => ({
        complianceOfficerName: profile?.complianceOfficerName ?? "",
        complianceOfficerEmail: profile?.complianceOfficerEmail ?? "",
      }),
      [profile],
    ),
  );
  const policies = useDraft(
    useMemo(
      () => ({
        termsUrl: profile?.termsUrl ?? "",
        privacyUrl: profile?.privacyUrl ?? "",
        refundPolicyUrl: profile?.refundPolicyUrl ?? "",
      }),
      [profile],
    ),
  );
  const fundsDetail = useDraft(
    useMemo(
      () => ({ fundsSourceDetail: profile?.fundsSourceDetail ?? "" }),
      [profile],
    ),
  );
  const signer = useDraft(
    useMemo(() => ({ attestedBy: profile?.attestedBy ?? "" }), [profile]),
  );

  const text = (error: FieldError | undefined, key: string) =>
    error ? t(error.key, error.values) : issues[key];

  const incorporationErrors = {
    incorporationCountry: countryError(
      incorporation.draft.incorporationCountry,
    ),
    incorporatedOn: pastDateError(incorporation.draft.incorporatedOn),
  };
  const regionsErrors = {
    customerRegions: regionsError(regions.draft.customerRegions),
  };
  const licenceErrors = {
    licenceType: lengthError(licence.draft.licenceType, 128),
    licenceNumber: lengthError(licence.draft.licenceNumber, 64),
    regulator: lengthError(licence.draft.regulator, 128),
  };
  const officerErrors = {
    complianceOfficerName: lengthError(
      officer.draft.complianceOfficerName,
      120,
    ),
    complianceOfficerEmail: emailError(officer.draft.complianceOfficerEmail),
  };
  const policyErrors = {
    termsUrl: urlError(policies.draft.termsUrl),
    privacyUrl: urlError(policies.draft.privacyUrl),
    refundPolicyUrl: urlError(policies.draft.refundPolicyUrl),
  };
  const fundsDetailErrors = {
    fundsSourceDetail: lengthError(fundsDetail.draft.fundsSourceDetail, 2000),
  };
  const signerErrors = {
    attestedBy: lengthError(signer.draft.attestedBy, 120),
  };

  const save = (changes: Record<string, unknown>, section: string) =>
    dispatch(
      updateCompliance(blankFieldsToNull(changes) as ComplianceUpdate, section),
    );

  const volumes = Object.values(MONTHLY_VOLUME).map((value) => ({
    title: t(`compliance.volume.${value}`),
    value,
  }));
  const customerBases = Object.values(CUSTOMER_BASE).map((value) => ({
    title: t(`compliance.customerBase.${value}`),
    value,
  }));
  const fundsSources = Object.values(FUNDS_SOURCE).map((value) => ({
    title: t(`compliance.fundsSource.${value}`),
    value,
  }));

  const attestationNote = (signedAt: string | null) =>
    signedAt
      ? t("compliance.attest.signedOn", { date: formatDate(signedAt) })
      : t("compliance.attest.notSigned");

  return (
    <SettingsPage
      titleKey="page.settings.compliance.title"
      descriptionKey="page.settings.compliance.description"
    >
      {isLoading && !hasLoaded ? (
        <p className="text-ink-muted text-sm">{t("settings.loading")}</p>
      ) : (
        <>
          <ReviewCard />

          <SettingsSection
            id="compliance-incorporation"
            title={t("compliance.incorporation.title")}
            description={t("compliance.incorporation.description")}
          >
            <EditableCard
              isDirty={incorporation.isDirty}
              isInvalid={invalid(incorporationErrors)}
              isSaving={savingIncorporation}
              onSave={() =>
                save(
                  {
                    ...incorporation.changes,
                    ...(incorporation.changes.incorporationCountry !== undefined
                      ? {
                          incorporationCountry:
                            incorporation.changes.incorporationCountry
                              .trim()
                              .toUpperCase(),
                        }
                      : {}),
                  },
                  "incorporation",
                )
              }
              onReset={incorporation.reset}
            >
              <FieldRow
                title={t("compliance.incorporation.country")}
                description={t("compliance.incorporation.countryHint")}
                htmlFor="compliance-incorporation-country"
              >
                <TextInput
                  id="compliance-incorporation-country"
                  value={incorporation.draft.incorporationCountry}
                  error={text(
                    incorporationErrors.incorporationCountry,
                    "incorporationCountry",
                  )}
                  maxLength={2}
                  placeholder="GB"
                  format="uppercase"
                  disabled={locked}
                  onChange={(v) =>
                    incorporation.set("incorporationCountry", v.slice(0, 2))
                  }
                />
              </FieldRow>
              <FieldRow
                title={t("compliance.incorporation.date")}
                description={t("compliance.incorporation.dateHint")}
                htmlFor="compliance-incorporation-date"
              >
                <TextInput
                  id="compliance-incorporation-date"
                  type="date"
                  value={incorporation.draft.incorporatedOn}
                  error={text(
                    incorporationErrors.incorporatedOn,
                    "incorporatedOn",
                  )}
                  disabled={locked}
                  onChange={(v) => incorporation.set("incorporatedOn", v)}
                />
              </FieldRow>
            </EditableCard>
          </SettingsSection>

          <OwnersCard />

          <SettingsSection
            id="compliance-operations"
            title={t("compliance.operations.title")}
            description={t("compliance.operations.description")}
          >
            <InstantCard isSaving={savingOperations}>
              <div className="flex flex-col gap-5">
                <SettingRow
                  title={t("compliance.operations.volume")}
                  description={t("compliance.operations.volumeHint")}
                  htmlFor="compliance-volume"
                  error={issues.monthlyVolume}
                >
                  <Select
                    id="compliance-volume"
                    value={profile?.monthlyVolume ?? ""}
                    options={volumes}
                    disabled={locked}
                    onChange={(v) =>
                      save({ monthlyVolume: v as MonthlyVolume }, "operations")
                    }
                  />
                </SettingRow>
                <SettingRow
                  title={t("compliance.operations.customerBase")}
                  description={t("compliance.operations.customerBaseHint")}
                  htmlFor="compliance-customer-base"
                  error={issues.customerBase}
                >
                  <Select
                    id="compliance-customer-base"
                    value={profile?.customerBase ?? ""}
                    options={customerBases}
                    disabled={locked}
                    onChange={(v) =>
                      save({ customerBase: v as CustomerBase }, "operations")
                    }
                  />
                </SettingRow>
              </div>
            </InstantCard>

            <EditableCard
              isDirty={regions.isDirty}
              isInvalid={invalid(regionsErrors)}
              isSaving={savingRegions}
              onSave={() =>
                save(
                  {
                    customerRegions:
                      parseRegions(regions.draft.customerRegions) ?? [],
                  },
                  "regions",
                )
              }
              onReset={regions.reset}
            >
              <FieldRow
                title={t("compliance.operations.regions")}
                description={t("compliance.operations.regionsHint")}
                htmlFor="compliance-regions"
              >
                <TextInput
                  id="compliance-regions"
                  value={regions.draft.customerRegions}
                  error={text(regionsErrors.customerRegions, "customerRegions")}
                  placeholder="GB, US, DE"
                  format="uppercase"
                  disabled={locked}
                  onChange={(v) => regions.set("customerRegions", v)}
                />
              </FieldRow>
            </EditableCard>
          </SettingsSection>

          <SettingsSection
            id="compliance-licensing"
            title={t("compliance.licensing.title")}
            description={t("compliance.licensing.description")}
          >
            <SwitchCard
              id="compliance-regulated"
              title={t("compliance.licensing.regulated")}
              description={t("compliance.licensing.regulatedHint")}
              checked={profile?.isRegulated ?? false}
              isSaving={savingRegulated}
              disabled={locked}
              onToggle={(v) => save({ isRegulated: v }, "isRegulated")}
            />

            <EditableCard
              isDirty={licence.isDirty}
              isInvalid={invalid(licenceErrors)}
              isSaving={savingLicence}
              onSave={() => save(licence.changes, "licence")}
              onReset={licence.reset}
            >
              <FieldRow
                title={t("compliance.licensing.type")}
                description={t(
                  profile?.isRegulated
                    ? "compliance.licensing.typeHint"
                    : "compliance.licensing.offHint",
                )}
                htmlFor="compliance-licence-type"
              >
                <TextInput
                  id="compliance-licence-type"
                  value={licence.draft.licenceType}
                  error={text(licenceErrors.licenceType, "licenceType")}
                  maxLength={128}
                  disabled={locked || !profile?.isRegulated}
                  onChange={(v) => licence.set("licenceType", v)}
                />
              </FieldRow>
              <FieldRow
                title={t("compliance.licensing.number")}
                description={t("compliance.licensing.numberHint")}
                htmlFor="compliance-licence-number"
              >
                <TextInput
                  id="compliance-licence-number"
                  value={licence.draft.licenceNumber}
                  error={text(licenceErrors.licenceNumber, "licenceNumber")}
                  maxLength={64}
                  disabled={locked || !profile?.isRegulated}
                  onChange={(v) => licence.set("licenceNumber", v)}
                />
              </FieldRow>
              <FieldRow
                title={t("compliance.licensing.regulator")}
                description={t("compliance.licensing.regulatorHint")}
                htmlFor="compliance-regulator"
              >
                <TextInput
                  id="compliance-regulator"
                  value={licence.draft.regulator}
                  error={text(licenceErrors.regulator, "regulator")}
                  maxLength={128}
                  disabled={locked || !profile?.isRegulated}
                  onChange={(v) => licence.set("regulator", v)}
                />
              </FieldRow>
            </EditableCard>
          </SettingsSection>

          <SettingsSection
            id="compliance-aml"
            title={t("compliance.aml.title")}
            description={t("compliance.aml.description")}
          >
            <SwitchCard
              id="compliance-aml-policy"
              title={t("compliance.aml.policy")}
              description={t("compliance.aml.policyHint")}
              checked={profile?.hasAmlPolicy ?? false}
              isSaving={savingAmlPolicy}
              disabled={locked}
              onToggle={(v) => save({ hasAmlPolicy: v }, "hasAmlPolicy")}
            />

            <EditableCard
              isDirty={officer.isDirty}
              isInvalid={invalid(officerErrors)}
              isSaving={savingOfficer}
              onSave={() => save(officer.changes, "officer")}
              onReset={officer.reset}
            >
              <FieldRow
                title={t("compliance.aml.officerName")}
                description={t("compliance.aml.officerNameHint")}
                htmlFor="compliance-officer-name"
              >
                <TextInput
                  id="compliance-officer-name"
                  autoComplete="name"
                  value={officer.draft.complianceOfficerName}
                  error={text(
                    officerErrors.complianceOfficerName,
                    "complianceOfficerName",
                  )}
                  maxLength={120}
                  disabled={locked}
                  onChange={(v) => officer.set("complianceOfficerName", v)}
                />
              </FieldRow>
              <FieldRow
                title={t("compliance.aml.officerEmail")}
                description={t("compliance.aml.officerEmailHint")}
                htmlFor="compliance-officer-email"
              >
                <TextInput
                  id="compliance-officer-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={officer.draft.complianceOfficerEmail}
                  error={text(
                    officerErrors.complianceOfficerEmail,
                    "complianceOfficerEmail",
                  )}
                  maxLength={255}
                  disabled={locked}
                  onChange={(v) => officer.set("complianceOfficerEmail", v)}
                />
              </FieldRow>
            </EditableCard>

            <EditableCard
              isDirty={policies.isDirty}
              isInvalid={invalid(policyErrors)}
              isSaving={savingPolicies}
              onSave={() => save(policies.changes, "policies")}
              onReset={policies.reset}
            >
              <FieldRow
                title={t("compliance.aml.terms")}
                description={t("compliance.aml.termsHint")}
                htmlFor="compliance-terms"
              >
                <TextInput
                  id="compliance-terms"
                  type="url"
                  inputMode="url"
                  value={policies.draft.termsUrl}
                  error={text(policyErrors.termsUrl, "termsUrl")}
                  maxLength={255}
                  placeholder="https://example.com/terms"
                  disabled={locked}
                  onChange={(v) => policies.set("termsUrl", v)}
                />
              </FieldRow>
              <FieldRow
                title={t("compliance.aml.privacy")}
                description={t("compliance.aml.privacyHint")}
                htmlFor="compliance-privacy"
              >
                <TextInput
                  id="compliance-privacy"
                  type="url"
                  inputMode="url"
                  value={policies.draft.privacyUrl}
                  error={text(policyErrors.privacyUrl, "privacyUrl")}
                  maxLength={255}
                  placeholder="https://example.com/privacy"
                  disabled={locked}
                  onChange={(v) => policies.set("privacyUrl", v)}
                />
              </FieldRow>
              <FieldRow
                title={t("compliance.aml.refund")}
                description={t("compliance.aml.refundHint")}
                htmlFor="compliance-refund"
              >
                <TextInput
                  id="compliance-refund"
                  type="url"
                  inputMode="url"
                  value={policies.draft.refundPolicyUrl}
                  error={text(policyErrors.refundPolicyUrl, "refundPolicyUrl")}
                  maxLength={255}
                  placeholder="https://example.com/refunds"
                  disabled={locked}
                  onChange={(v) => policies.set("refundPolicyUrl", v)}
                />
              </FieldRow>
            </EditableCard>
          </SettingsSection>

          <SettingsSection
            id="compliance-funds"
            title={t("compliance.funds.title")}
            description={t("compliance.funds.description")}
          >
            <InstantCard isSaving={savingFunds}>
              <SettingRow
                title={t("compliance.funds.source")}
                description={t("compliance.funds.sourceHint")}
                htmlFor="compliance-funds-source"
                error={issues.fundsSource}
              >
                <Select
                  id="compliance-funds-source"
                  value={profile?.fundsSource ?? ""}
                  options={fundsSources}
                  disabled={locked}
                  onChange={(v) =>
                    save({ fundsSource: v as FundsSource }, "fundsSource")
                  }
                />
              </SettingRow>
            </InstantCard>

            <EditableCard
              isDirty={fundsDetail.isDirty}
              isInvalid={invalid(fundsDetailErrors)}
              isSaving={savingFundsDetail}
              onSave={() => save(fundsDetail.changes, "fundsDetail")}
              onReset={fundsDetail.reset}
            >
              <FieldRow
                title={t("compliance.funds.detail")}
                description={t("compliance.funds.detailHint")}
                htmlFor="compliance-funds-detail"
              >
                <TextArea
                  id="compliance-funds-detail"
                  value={fundsDetail.draft.fundsSourceDetail}
                  error={text(
                    fundsDetailErrors.fundsSourceDetail,
                    "fundsSourceDetail",
                  )}
                  maxLength={2000}
                  disabled={locked}
                  onChange={(v) => fundsDetail.set("fundsSourceDetail", v)}
                />
              </FieldRow>
            </EditableCard>
          </SettingsSection>

          <SettingsSection
            id="compliance-attestations"
            title={t("compliance.attest.title")}
            description={t("compliance.attest.description")}
          >
            <SwitchCard
              id="compliance-attest-sanctions"
              title={t("compliance.attest.sanctions")}
              description={t("compliance.attest.sanctionsHint")}
              note={attestationNote(profile?.sanctionsAttestedAt ?? null)}
              checked={Boolean(profile?.sanctionsAttestedAt)}
              isSaving={savingSanctions}
              disabled={locked}
              onToggle={(v) =>
                save({ sanctionsAttested: v }, "sanctionsAttested")
              }
            />
            <SwitchCard
              id="compliance-attest-prohibited"
              title={t("compliance.attest.prohibited")}
              description={t("compliance.attest.prohibitedHint")}
              note={attestationNote(profile?.prohibitedAttestedAt ?? null)}
              checked={Boolean(profile?.prohibitedAttestedAt)}
              isSaving={savingProhibited}
              disabled={locked}
              onToggle={(v) =>
                save({ prohibitedAttested: v }, "prohibitedAttested")
              }
            />
            <SwitchCard
              id="compliance-attest-accuracy"
              title={t("compliance.attest.accuracy")}
              description={t("compliance.attest.accuracyHint")}
              note={attestationNote(profile?.accuracyAttestedAt ?? null)}
              checked={Boolean(profile?.accuracyAttestedAt)}
              isSaving={savingAccuracy}
              disabled={locked}
              onToggle={(v) =>
                save({ accuracyAttested: v }, "accuracyAttested")
              }
            />

            <EditableCard
              isDirty={signer.isDirty}
              isInvalid={invalid(signerErrors)}
              isSaving={savingSigner}
              onSave={() => save(signer.changes, "signer")}
              onReset={signer.reset}
            >
              <FieldRow
                title={t("compliance.attest.by")}
                description={t("compliance.attest.byHint")}
                htmlFor="compliance-attested-by"
              >
                <TextInput
                  id="compliance-attested-by"
                  autoComplete="name"
                  value={signer.draft.attestedBy}
                  error={text(signerErrors.attestedBy, "attestedBy")}
                  maxLength={120}
                  disabled={locked}
                  onChange={(v) => signer.set("attestedBy", v)}
                />
              </FieldRow>
            </EditableCard>
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  );
}
