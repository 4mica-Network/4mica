import type { FastifyRequest } from "fastify";

const PLACEHOLDER_HOST = "clerk-dummy";

export const toWebRequest = (request: FastifyRequest): Request => {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
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
