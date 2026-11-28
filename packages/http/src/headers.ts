export type RequestHeadersProvider = () => Record<string, string> | null;

let provider: RequestHeadersProvider | null = null;

export const setRequestHeadersProvider = (
  next: RequestHeadersProvider | null,
): void => {
  provider = next;
};

export const resolveRequestHeaders = (): Record<string, string> => {
  if (!provider) {
    return {};
  }

  try {
    return provider() ?? {};
  } catch {
    return {};
  }
};
