import {
  countryCode,
  email,
  pastDate,
  singleLine,
  webUrl,
} from "@controllers/schema-primitives";
import * as v from "valibot";

export const MONTHLY_VOLUMES = [
  "UNDER_10K",
  "FROM_10K_TO_100K",
  "FROM_100K_TO_1M",
  "OVER_1M",
] as const;

export const CUSTOMER_BASES = ["BUSINESSES", "CONSUMERS", "BOTH"] as const;

export const FUNDS_SOURCES = [
  "BUSINESS_REVENUE",
  "INVESTMENT",
  "LOANS",
  "PERSONAL_SAVINGS",
  "OTHER",
] as const;

export const OWNER_ROLES = [
  "OWNER",
  "DIRECTOR",
  "CONTROLLER",
  "SIGNATORY",
] as const;

export const MAX_BENEFICIAL_OWNERS = 20;
export const MIN_OWNER_AGE = 18;

const nullableText = (max: number) =>
  v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max)));

const nullableLine = (max: number) =>
  v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max), singleLine));

const personName = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(2, "must be at least 2 characters"),
  v.maxLength(120),
  singleLine,
);

const isAdult = (value: string): boolean => {
  const born = new Date(`${value}T00:00:00Z`);
  const adult = new Date(born);
  adult.setUTCFullYear(born.getUTCFullYear() + MIN_OWNER_AGE);
  return adult.getTime() <= Date.now();
};

const dateOfBirth = v.pipe(
  pastDate,
  v.check(isAdult, `must be at least ${MIN_OWNER_AGE} years old`),
);

const ownershipPercent = v.nullable(
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
);

export const UpdateComplianceSchema = v.partial(
  v.object({
    incorporationCountry: v.nullable(countryCode),
    incorporatedOn: v.nullable(pastDate),
    monthlyVolume: v.nullable(v.picklist(MONTHLY_VOLUMES)),
    customerBase: v.nullable(v.picklist(CUSTOMER_BASES)),
    customerRegions: v.pipe(
      v.array(countryCode),
      v.maxLength(250),
      v.transform((regions) => [...new Set(regions)]),
    ),
    isRegulated: v.boolean(),
    licenceType: nullableLine(128),
    licenceNumber: nullableLine(64),
    regulator: nullableLine(128),
    hasAmlPolicy: v.boolean(),
    complianceOfficerName: v.nullable(personName),
    complianceOfficerEmail: v.nullable(email(255)),
    termsUrl: v.nullable(webUrl(255)),
    privacyUrl: v.nullable(webUrl(255)),
    refundPolicyUrl: v.nullable(webUrl(255)),
    fundsSource: v.nullable(v.picklist(FUNDS_SOURCES)),
    fundsSourceDetail: nullableText(2000),
    sanctionsAttested: v.boolean(),
    prohibitedAttested: v.boolean(),
    accuracyAttested: v.boolean(),
    attestedBy: v.nullable(personName),
  }),
);

const ownerFields = {
  fullName: personName,
  role: v.picklist(OWNER_ROLES),
  ownershipPercent,
  dateOfBirth,
  nationality: countryCode,
  countryOfResidence: countryCode,
  email: v.nullable(email(255)),
  isPep: v.boolean(),
};

export const CreateBeneficialOwnerSchema = v.pipe(
  v.object({
    ...ownerFields,
    ownershipPercent: v.optional(ownershipPercent, null),
    email: v.optional(ownerFields.email, null),
    isPep: v.optional(ownerFields.isPep, false),
  }),
  v.forward(
    v.partialCheck(
      [["role"], ["ownershipPercent"]],
      (owner) => owner.role !== "OWNER" || (owner.ownershipPercent ?? 0) > 0,
      "an owner needs an ownership percentage",
    ),
    ["ownershipPercent"],
  ),
);

export const UpdateBeneficialOwnerSchema = v.partial(v.object(ownerFields));

export type UpdateComplianceInput = v.InferOutput<
  typeof UpdateComplianceSchema
>;
export type CreateBeneficialOwnerInput = v.InferOutput<
  typeof CreateBeneficialOwnerSchema
>;
export type UpdateBeneficialOwnerInput = v.InferOutput<
  typeof UpdateBeneficialOwnerSchema
>;
