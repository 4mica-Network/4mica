export interface AuthTokenOptions {
  forceRefresh?: boolean;
}

export type AuthTokenProvider = (
  options?: AuthTokenOptions,
) => Promise<string | null> | string | null;

export type UnauthorizedHandler = () => void;

let provider: AuthTokenProvider | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export const setAuthTokenProvider = (next: AuthTokenProvider | null): void => {
  provider = next;
};

export const setUnauthorizedHandler = (
  next: UnauthorizedHandler | null,
): void => {
  unauthorizedHandler = next;
};

export const notifyUnauthorized = (): void => {
  try {
    unauthorizedHandler?.();
  } catch {}
};

export const resolveAuthToken = async (
  options?: AuthTokenOptions,
): Promise<string | null> => {
  if (!provider) {
    return null;
  }

  try {
    return await provider(options);
  } catch {
    return null;
  }
};
