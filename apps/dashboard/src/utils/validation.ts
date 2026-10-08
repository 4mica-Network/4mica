const SPACE_OR_CONTROL = /[\s\p{Cc}]/u;
const LINE_BREAK = /[\p{Cc}\p{Zl}\p{Zp}]/u;

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const isWebUrl = (value: string): boolean => {
  if (SPACE_OR_CONTROL.test(value)) {
    return false;
  }

  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === "https:" || protocol === "http:") && hostname !== "";
  } catch {
    return false;
  }
};

export const isHttpsUrl = (value: string): boolean =>
  isWebUrl(value) && value.startsWith("https://");

export const isEmail = (value: string): boolean => EMAIL_PATTERN.test(value);

export const isPhoneNumber = (value: string): boolean =>
  PHONE_PATTERN.test(value);

export const isSingleLine = (value: string): boolean => !LINE_BREAK.test(value);

export const isUuidShaped = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const hasErrors = (errors: Record<string, string | undefined>) =>
  Object.values(errors).some((error) => error !== undefined);
