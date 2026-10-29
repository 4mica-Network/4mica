import { prisma } from "@4mica/db";
import { missingRequirements } from "@utils/compliance-readiness";
import type {
  CreateBeneficialOwnerInput,
  UpdateBeneficialOwnerInput,
  UpdateComplianceInput,
} from "./schema";

export const PROFILE_SELECT = {
  incorporationCountry: true,
  incorporatedOn: true,
  monthlyVolume: true,
  customerBase: true,
  customerRegions: true,
  isRegulated: true,
  licenceType: true,
  licenceNumber: true,
  regulator: true,
  hasAmlPolicy: true,
  complianceOfficerName: true,
  complianceOfficerEmail: true,
  termsUrl: true,
  privacyUrl: true,
  refundPolicyUrl: true,
  fundsSource: true,
  fundsSourceDetail: true,
  sanctionsAttestedAt: true,
  prohibitedAttestedAt: true,
  accuracyAttestedAt: true,
  attestedBy: true,
  submittedAt: true,
  updatedAt: true,
} as const;

export const OWNER_SELECT = {
  id: true,
  fullName: true,
  role: true,
  ownershipPercent: true,
  dateOfBirth: true,
  nationality: true,
  countryOfResidence: true,
  email: true,
  isPep: true,
  createdAt: true,
  updatedAt: true,
} as const;

const READINESS_BUSINESS_SELECT = {
  legalName: true,
  businessType: true,
  registrationNumber: true,
  taxId: true,
  website: true,
  addressLine1: true,
  city: true,
  postalCode: true,
  country: true,
  kybStatus: true,
} as const;

const LOCKED_STATUSES = new Set(["PENDING", "VERIFIED"]);

const toIsoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const fromIsoDate = (value: string): Date => new Date(`${value}T00:00:00Z`);

type StoredOwner = {
  dateOfBirth: Date;
} & Record<string, unknown>;

const shapeOwner = <T extends StoredOwner>(owner: T) => ({
  ...owner,
  dateOfBirth: toIsoDate(owner.dateOfBirth),
});

const listStoredOwners = (ownerId: string) =>
  prisma.beneficialOwner.findMany({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
    select: OWNER_SELECT,
  });

export const getComplianceState = async (ownerId: string) => {
  const [profile, owners, business] = await Promise.all([
    prisma.complianceProfile.findUnique({
      where: { ownerId },
      select: PROFILE_SELECT,
    }),
    listStoredOwners(ownerId),
    prisma.business.findUnique({
      where: { ownerId },
      select: READINESS_BUSINESS_SELECT,
    }),
  ]);

  return {
    kybStatus: business?.kybStatus ?? "UNVERIFIED",
    profile: profile
      ? { ...profile, incorporatedOn: toIsoDate(profile.incorporatedOn) }
      : null,
    owners: owners.map(shapeOwner),
    missing: missingRequirements(business, profile, owners),
  };
};

export const isComplianceLocked = async (ownerId: string) => {
  const business = await prisma.business.findUnique({
    where: { ownerId },
    select: { kybStatus: true },
  });
  return business ? LOCKED_STATUSES.has(business.kybStatus) : false;
};

const attestation = (
  requested: boolean | undefined,
  current: Date | null | undefined,
  now: Date,
): Date | null | undefined => {
  if (requested === undefined) {
    return undefined;
  }
  return requested ? (current ?? now) : null;
};

export const updateComplianceProfile = async (
  ownerId: string,
  data: UpdateComplianceInput,
) => {
  const {
    sanctionsAttested,
    prohibitedAttested,
    accuracyAttested,
    incorporatedOn,
    ...fields
  } = data;

  const current = await prisma.complianceProfile.findUnique({
    where: { ownerId },
    select: {
      sanctionsAttestedAt: true,
      prohibitedAttestedAt: true,
      accuracyAttestedAt: true,
    },
  });

  const now = new Date();
  const write = {
    ...fields,
    ...(incorporatedOn !== undefined
      ? { incorporatedOn: incorporatedOn ? fromIsoDate(incorporatedOn) : null }
      : {}),
    sanctionsAttestedAt: attestation(
      sanctionsAttested,
      current?.sanctionsAttestedAt,
      now,
    ),
    prohibitedAttestedAt: attestation(
      prohibitedAttested,
      current?.prohibitedAttestedAt,
      now,
    ),
    accuracyAttestedAt: attestation(
      accuracyAttested,
      current?.accuracyAttestedAt,
      now,
    ),
  };

  await prisma.complianceProfile.upsert({
    where: { ownerId },
    create: { ...write, ownerId },
    update: write,
  });

  return getComplianceState(ownerId);
};

export const listBeneficialOwners = async (ownerId: string) =>
  (await listStoredOwners(ownerId)).map(shapeOwner);

export const countBeneficialOwners = (ownerId: string) =>
  prisma.beneficialOwner.count({ where: { ownerId } });

export const ownershipHeldByOthers = async (
  ownerId: string,
  excludeId?: string,
) => {
  const { _sum } = await prisma.beneficialOwner.aggregate({
    where: { ownerId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    _sum: { ownershipPercent: true },
  });
  return _sum.ownershipPercent ?? 0;
};

export const createBeneficialOwner = async (
  ownerId: string,
  data: CreateBeneficialOwnerInput,
) =>
  shapeOwner(
    await prisma.beneficialOwner.create({
      data: { ...data, dateOfBirth: fromIsoDate(data.dateOfBirth), ownerId },
      select: OWNER_SELECT,
    }),
  );

export const updateBeneficialOwner = async (
  ownerId: string,
  id: string,
  data: UpdateBeneficialOwnerInput,
) => {
  const { dateOfBirth, ...fields } = data;
  const { count } = await prisma.beneficialOwner.updateMany({
    where: { id, ownerId },
    data: {
      ...fields,
      ...(dateOfBirth ? { dateOfBirth: fromIsoDate(dateOfBirth) } : {}),
    },
  });

  if (count === 0) {
    return null;
  }

  const owner = await prisma.beneficialOwner.findUnique({
    where: { id },
    select: OWNER_SELECT,
  });
  return owner ? shapeOwner(owner) : null;
};

export const deleteBeneficialOwner = async (ownerId: string, id: string) => {
  const { count } = await prisma.beneficialOwner.deleteMany({
    where: { id, ownerId },
  });
  return count > 0;
};

export const submitForReview = async (ownerId: string) => {
  const now = new Date();

  await prisma.$transaction([
    prisma.complianceProfile.update({
      where: { ownerId },
      data: { submittedAt: now },
    }),
    prisma.business.update({
      where: { ownerId },
      data: { kybStatus: "PENDING" },
    }),
  ]);

  return getComplianceState(ownerId);
};
