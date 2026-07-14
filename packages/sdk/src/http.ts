export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type DecodeErrorFactory = (message: string, response: Response) => Error;
type HttpErrorFactory = (
  message: string,
  response: Response,
  body: unknown,
) => Error;

export function normalizeBaseUrl(endpoint: string): string {
  return endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
}

export function extractErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error = record.error;
    const msg = record.message;
    return (
      (typeof error === "string" && error) ||
      (typeof msg === "string" && msg) ||
      JSON.stringify(record, (_k, v) => v)
    );
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  return "unknown error";
}

export async function requestJson<T>(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  options: {
    decodeError: DecodeErrorFactory;
    httpError: HttpErrorFactory;
    allowEmptyOk?: boolean;
  },
): Promise<T> {
  const response = await fetchFn(url, init);

  let text = "";
  try {
    text = await response.text();
  } catch (err) {
    throw options.decodeError(
      `invalid response from ${response.url}: ${String(err)}`,
      response,
    );
  }

  let payload: unknown = null;
  let parsed = false;
  let parseError: unknown;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
      parsed = true;
    } catch (err) {
      payload = text;
      parseError = err;
    }
  }

  if (!response.ok) {
    const message = `${response.status}: ${extractErrorMessage(payload)}`;
    throw options.httpError(message, response, payload);
  }

  if (!text && !options.allowEmptyOk) {
    throw options.decodeError(
      `invalid JSON response from ${response.url}: empty response body`,
      response,
    );
  }

  if (text && !parsed) {
    const detail =
      parseError instanceof Error ? parseError.message : String(parseError);
    throw options.decodeError(
      `invalid JSON response from ${response.url}: ${detail}`,
      response,
    );
  }

  return payload as T;
}
