export type AuthTokenProvider = () => Promise<string | null> | string | null;

let provider: AuthTokenProvider | null = null;

export const setAuthTokenProvider = (next: AuthTokenProvider | null): void => {
  provider = next;
};

export const resolveAuthToken = async (): Promise<string | null> => {
  if (!provider) {
    return null;
  }

  try {
    return await provider();
  } catch {
    return null;
  }
};
