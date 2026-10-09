export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const isEmail = (value: string): boolean => EMAIL_PATTERN.test(value);

export const hasErrors = (errors: Record<string, string | undefined>) =>
  Object.values(errors).some((error) => error !== undefined);
