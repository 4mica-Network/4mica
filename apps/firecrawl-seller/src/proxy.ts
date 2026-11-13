import { randomUUID } from "node:crypto";

export interface ProxyCall {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  /** The buyer, for the proxy's per-payer limits. */
  payer: string;
  /** The most this call may cost, in Firecrawl credits. */
  maxCredits: number;
}

export interface ProxyResult {
  ok: boolean;
  status: number;
  text: string;
  /** Credits this call cost. Absent when it never reached Firecrawl. */
  credits?: number;
  /** A job's final credits, once the proxy has settled it. */
  jobCredits?: number;
}

export function proxyClient(baseUrl: string, token: string) {
  return async function call({
    method,
    path,
    body,
    payer,
    maxCredits,
  }: ProxyCall): Promise<ProxyResult> {
    const response = await fetch(`${baseUrl}/firecrawl${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-invocation-id": randomUUID(),
        "x-payer": payer,
        "x-max-cost": String(maxCredits),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // The proxy gives Firecrawl 330 s.
      signal: AbortSignal.timeout(340_000),
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
      credits: numberHeader(response.headers.get("x-proxy-cost")),
      jobCredits: numberHeader(response.headers.get("x-proxy-job-cost")),
    };
  };
}

export type CallProxy = ReturnType<typeof proxyClient>;

function numberHeader(value: string | null): number | undefined {
  return value === null ? undefined : Number(value);
}
