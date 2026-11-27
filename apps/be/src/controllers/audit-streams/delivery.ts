import { createHmac, randomUUID } from "node:crypto";
import { resolvesPublicly } from "@utils/public-host";

export const DELIVERY_TIMEOUT_MS = 10_000;
export const SIGNATURE_HEADER = "x-4mica-signature";
export const DELIVERY_HEADER = "x-4mica-delivery";

export const streamSecret = (
  signingKey: string,
  streamId: string,
  version: number,
): string =>
  createHmac("sha256", signingKey)
    .update(`${streamId}:${version}`)
    .digest("base64url");

export const secretPrefix = (secret: string): string => secret.slice(0, 6);

export const signature = (secret: string, timestamp: number, body: string) =>
  `t=${timestamp},v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")}`;

export interface AuditEventRow {
  id: string;
  organizationId: string;
  projectId: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: Date;
}

export const toAuditEvent = (row: AuditEventRow) => ({
  id: row.id,
  action: row.action,
  createdAt: row.createdAt.toISOString(),
  projectId: row.projectId,
  actorUserId: row.actorUserId,
  actorApiKeyId: row.actorApiKeyId,
  targetType: row.targetType,
  targetId: row.targetId,
  metadata: row.metadata ?? null,
  ip: row.ip,
});

export interface DeliveryTarget {
  id: string;
  organizationId: string;
  url: string;
}

export interface DeliveryResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  deliveryId: string;
}

export const deliver = async (
  target: DeliveryTarget,
  secret: string,
  events: ReturnType<typeof toAuditEvent>[],
  now: () => Date = () => new Date(),
): Promise<DeliveryResult> => {
  const deliveryId = randomUUID();
  const fail = (error: string, statusCode: number | null = null) => ({
    ok: false,
    statusCode,
    error: error.slice(0, 500),
    deliveryId,
  });

  let url: URL;
  try {
    url = new URL(target.url);
  } catch {
    return fail("The stream URL is not valid.");
  }
  if (url.protocol !== "https:") {
    return fail("The stream URL must use https.");
  }
  if (!(await resolvesPublicly(url.hostname))) {
    return fail("The stream URL does not resolve to a public address.");
  }

  const body = JSON.stringify({
    stream: { id: target.id, organizationId: target.organizationId },
    events,
  });
  const timestamp = Math.floor(now().getTime() / 1000);

  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "4mica-audit-stream/1",
        [SIGNATURE_HEADER]: signature(secret, timestamp, body),
        [DELIVERY_HEADER]: deliveryId,
      },
      body,
    });
    await response.body?.cancel().catch(() => undefined);

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, statusCode: response.status, error: null, deliveryId };
    }
    if (
      response.type === "opaqueredirect" ||
      (response.status >= 300 && response.status < 400)
    ) {
      return fail(
        "The endpoint redirected; redirects are not followed.",
        response.status || null,
      );
    }
    return fail(`The endpoint answered ${response.status}.`, response.status);
  } catch (error) {
    return fail(
      error instanceof Error && error.name === "TimeoutError"
        ? `The endpoint did not answer within ${DELIVERY_TIMEOUT_MS / 1000}s.`
        : `The endpoint could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
