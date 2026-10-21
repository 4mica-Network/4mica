import { isWebUrl } from "@4mica/rules";
import { isEmail } from "@utils/validation";

export const MIN_OWNER_AGE = 18;

const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type FieldError = { key: string; values?: Record<string, unknown> };

const startOfDay = (value: string) => new Date(`${value}T00:00:00Z`);

export const countryError = (value: string): FieldError | undefined =>
  value.trim() === "" || COUNTRY_PATTERN.test(value.trim())
    ? undefined
    : { key: "validation.countryCode" };

export const pastDateError = (value: string): FieldError | undefined => {
  if (value === "") {
    return undefined;
  }
  return DATE_PATTERN.test(value) && startOfDay(value).getTime() <= Date.now()
    ? undefined
    : { key: "validation.pastDate" };
};

export const isAdult = (value: string, now = new Date()): boolean => {
  const adult = startOfDay(value);
  adult.setUTCFullYear(adult.getUTCFullYear() + MIN_OWNER_AGE);
  return adult.getTime() <= now.getTime();
};

export const parseRegions = (value: string): string[] | null => {
  const codes = value
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  return codes.every((code) => COUNTRY_PATTERN.test(code))
    ? [...new Set(codes)]
    : null;
};

export const regionsError = (value: string): FieldError | undefined =>
  parseRegions(value) === null ? { key: "validation.countryList" } : undefined;

export const urlError = (value: string): FieldError | undefined =>
  value.trim() === "" || isWebUrl(value.trim())
    ? undefined
    : { key: "validation.webUrl" };

export const emailError = (value: string): FieldError | undefined =>
  value.trim() === "" || isEmail(value.trim())
    ? undefined
    : { key: "validation.email" };

export const lengthError = (
  value: string,
  max: number,
): FieldError | undefined =>
  value.trim().length > max
    ? { key: "validation.tooLong", values: { max } }
    : undefined;

export const percentError = (value: string): FieldError | undefined => {
  if (value.trim() === "") {
    return undefined;
  }
  const percent = Number(value);
  return Number.isInteger(percent) && percent >= 1 && percent <= 100
    ? undefined
    : { key: "validation.ownershipPercent" };
};

export interface OwnerDraft {
  fullName: string;
  role: string;
  ownershipPercent: string;
  dateOfBirth: string;
  nationality: string;
  countryOfResidence: string;
  email: string;
  isPep: boolean;
}

export const ownerErrors = (
  draft: OwnerDraft,
): Partial<Record<keyof OwnerDraft, FieldError>> => {
  const name = draft.fullName.trim();
  const errors: Partial<Record<keyof OwnerDraft, FieldError>> = {
    fullName:
      name.length < 2
        ? { key: "validation.minLength", values: { min: 2 } }
        : lengthError(name, 120),
    ownershipPercent:
      draft.role === "OWNER" && draft.ownershipPercent.trim() === ""
        ? { key: "validation.required" }
        : percentError(draft.ownershipPercent),
    dateOfBirth:
      draft.dateOfBirth === ""
        ? { key: "validation.required" }
        : (pastDateError(draft.dateOfBirth) ??
          (isAdult(draft.dateOfBirth)
            ? undefined
            : { key: "compliance.people.dateOfBirthHint" })),
    nationality:
      draft.nationality.trim() === ""
        ? { key: "validation.required" }
        : countryError(draft.nationality),
    countryOfResidence:
      draft.countryOfResidence.trim() === ""
        ? { key: "validation.required" }
        : countryError(draft.countryOfResidence),
    email: emailError(draft.email),
  };

  return Object.fromEntries(
    Object.entries(errors).filter(([, error]) => error !== undefined),
  );
};
