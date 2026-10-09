import type { FastifyRequest } from "fastify";

const PLACEHOLDER_HOST = "clerk-dummy";

export interface ToWebRequestOptions {
  /** Lower-case header names to leave out of the converted request. */
  omitHeaders?: readonly string[];
}

export const toWebRequest = (
  request: FastifyRequest,
  { omitHeaders = [] }: ToWebRequestOptions = {},
): Request => {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (omitHeaders.includes(key.toLowerCase())) {
      continue;
    }
    if (typeof value === "string") {
      headers.append(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    }
  }

  const host = request.headers.host ?? PLACEHOLDER_HOST;
  const url = new URL(request.url, `${request.protocol}://${host}`);

  return new Request(url, { method: request.method, headers });
};
