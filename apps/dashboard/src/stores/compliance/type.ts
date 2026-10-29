import type { KybStatus } from "@stores/user/type";

export const MONTHLY_VOLUME = {
  UNDER_10K: "UNDER_10K",
  FROM_10K_TO_100K: "FROM_10K_TO_100K",
  FROM_100K_TO_1M: "FROM_100K_TO_1M",
  OVER_1M: "OVER_1M",
} as const;

export type MonthlyVolume =
  (typeof MONTHLY_VOLUME)[keyof typeof MONTHLY_VOLUME];

export const CUSTOMER_BASE = {
  BUSINESSES: "BUSINESSES",
  CONSUMERS: "CONSUMERS",
  BOTH: "BOTH",
} as const;

export type CustomerBase = (typeof CUSTOMER_BASE)[keyof typeof CUSTOMER_BASE];

export const FUNDS_SOURCE = {
  BUSINESS_REVENUE: "BUSINESS_REVENUE",
  INVESTMENT: "INVESTMENT",
  LOANS: "LOANS",
  PERSONAL_SAVINGS: "PERSONAL_SAVINGS",
  OTHER: "OTHER",
} as const;

export type FundsSource = (typeof FUNDS_SOURCE)[keyof typeof FUNDS_SOURCE];

export const OWNER_ROLE = {
  OWNER: "OWNER",
  DIRECTOR: "DIRECTOR",
  CONTROLLER: "CONTROLLER",
  SIGNATORY: "SIGNATORY",
} as const;

export type OwnerRole = (typeof OWNER_ROLE)[keyof typeof OWNER_ROLE];

export interface ComplianceProfile {
  incorporationCountry: string | null;
  incorporatedOn: string | null;
  monthlyVolume: MonthlyVolume | null;
  customerBase: CustomerBase | null;
  customerRegions: string[];
  isRegulated: boolean;
  licenceType: string | null;
  licenceNumber: string | null;
  regulator: string | null;
  hasAmlPolicy: boolean;
  complianceOfficerName: string | null;
  complianceOfficerEmail: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  refundPolicyUrl: string | null;
  fundsSource: FundsSource | null;
  fundsSourceDetail: string | null;
  sanctionsAttestedAt: string | null;
  prohibitedAttestedAt: string | null;
  accuracyAttestedAt: string | null;
  attestedBy: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface BeneficialOwner {
  id: string;
  fullName: string;
  role: OwnerRole;
  ownershipPercent: number | null;
  dateOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  email: string | null;
  isPep: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BeneficialOwnerInput {
  fullName: string;
  role: OwnerRole;
  ownershipPercent: number | null;
  dateOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  email: string | null;
  isPep: boolean;
}

export type ComplianceUpdate = Partial<
  Omit<
    ComplianceProfile,
    | "sanctionsAttestedAt"
    | "prohibitedAttestedAt"
    | "accuracyAttestedAt"
    | "submittedAt"
    | "updatedAt"
  > & {
    sanctionsAttested: boolean;
    prohibitedAttested: boolean;
    accuracyAttested: boolean;
  }
>;

export interface ComplianceSnapshot {
  kybStatus: KybStatus;
  profile: ComplianceProfile | null;
  owners: BeneficialOwner[];
  missing: string[];
}

export type ComplianceState = ComplianceSnapshot & {
  isLoading: boolean;
  hasLoaded: boolean;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
};
