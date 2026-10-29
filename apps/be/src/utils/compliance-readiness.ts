export const COMPLIANCE_REQUIREMENTS = [
  "business.legalName",
  "business.businessType",
  "business.registrationNumber",
  "business.taxId",
  "business.website",
  "business.address",
  "profile.incorporation",
  "profile.operations",
  "profile.licence",
  "profile.complianceOfficer",
  "profile.policies",
  "profile.fundsSource",
  "owners",
  "owners.control",
  "attestations",
] as const;

export type ComplianceRequirement = (typeof COMPLIANCE_REQUIREMENTS)[number];

export interface ReadinessBusiness {
  legalName: string;
  businessType: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface ReadinessProfile {
  incorporationCountry: string | null;
  incorporatedOn: Date | null;
  monthlyVolume: string | null;
  customerBase: string | null;
  customerRegions: string[];
  isRegulated: boolean;
  licenceType: string | null;
  licenceNumber: string | null;
  regulator: string | null;
  complianceOfficerName: string | null;
  complianceOfficerEmail: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  fundsSource: string | null;
  fundsSourceDetail: string | null;
  sanctionsAttestedAt: Date | null;
  prohibitedAttestedAt: Date | null;
  accuracyAttestedAt: Date | null;
  attestedBy: string | null;
}

export interface ReadinessOwner {
  role: string;
}

const filled = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim() !== "";

/**
 * What still stands between a seller and a KYB review, in the order the
 * dashboard lists it. Business fields are checked here rather than on the
 * Business page because only submission makes them mandatory.
 */
export const missingRequirements = (
  business: ReadinessBusiness | null,
  profile: ReadinessProfile | null,
  owners: ReadinessOwner[],
): ComplianceRequirement[] => {
  const checks: Record<ComplianceRequirement, boolean> = {
    "business.legalName": filled(business?.legalName),
    "business.businessType": filled(business?.businessType),
    "business.registrationNumber": filled(business?.registrationNumber),
    "business.taxId": filled(business?.taxId),
    "business.website": filled(business?.website),
    "business.address":
      filled(business?.addressLine1) &&
      filled(business?.city) &&
      filled(business?.postalCode) &&
      filled(business?.country),
    "profile.incorporation":
      filled(profile?.incorporationCountry) && Boolean(profile?.incorporatedOn),
    "profile.operations":
      filled(profile?.monthlyVolume) &&
      filled(profile?.customerBase) &&
      (profile?.customerRegions.length ?? 0) > 0,
    "profile.licence":
      !profile?.isRegulated ||
      (filled(profile.licenceType) &&
        filled(profile.licenceNumber) &&
        filled(profile.regulator)),
    "profile.complianceOfficer":
      filled(profile?.complianceOfficerName) &&
      filled(profile?.complianceOfficerEmail),
    "profile.policies":
      filled(profile?.termsUrl) && filled(profile?.privacyUrl),
    "profile.fundsSource":
      filled(profile?.fundsSource) &&
      (profile?.fundsSource !== "OTHER" || filled(profile.fundsSourceDetail)),
    owners: owners.length > 0,
    "owners.control": owners.some(
      (owner) => owner.role === "OWNER" || owner.role === "CONTROLLER",
    ),
    attestations:
      Boolean(profile?.sanctionsAttestedAt) &&
      Boolean(profile?.prohibitedAttestedAt) &&
      Boolean(profile?.accuracyAttestedAt) &&
      filled(profile?.attestedBy),
  };

  return COMPLIANCE_REQUIREMENTS.filter((requirement) => !checks[requirement]);
};
