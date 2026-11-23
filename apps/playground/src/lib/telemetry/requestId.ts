export const REQUEST_ID_HEADER = "x-request-id";
export const UPSTREAM_REQUEST_ID_HEADER = "x-upstream-request-id";

const UPSTREAM_REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export const createRequestId = (): string => crypto.randomUUID();

export const parseUpstreamRequestId = (
  incoming: string | null | undefined,
): string | undefined =>
  incoming && UPSTREAM_REQUEST_ID_PATTERN.test(incoming) ? incoming : undefined;
