const SPACE_OR_CONTROL = /[\s\p{Cc}]/u;
const LINE_BREAK = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{2,16}$/;
export const DECIMAL_AMOUNT_PATTERN = /^(?!0\d)\d{1,20}(\.\d{1,18})?$/;
export const SIGNED_DECIMAL_AMOUNT_PATTERN = /^-?(?!0\d)\d{1,20}(\.\d{1,18})?$/;

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

export const isPhoneNumber = (value: string): boolean =>
  PHONE_PATTERN.test(value);

export const isHexColor = (value: string): boolean =>
  HEX_COLOR_PATTERN.test(value);

export const isDecimalAmount = (value: string): boolean =>
  DECIMAL_AMOUNT_PATTERN.test(value);

export const isSingleLine = (value: string): boolean => !LINE_BREAK.test(value);

export const isUuidShaped = (value: string): boolean =>
  UUID_PATTERN.test(value);
