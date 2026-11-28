import { createHmac, randomUUID } from "node:crypto";
import {
  OutboundAbortedError,
  OutboundTimeoutError,
  postToPublicUrl,
  UnsafeDestinationError,
} from "@utils/safe-outbound";

export const DELIVERY_TIMEOUT_MS = 10_000;
export const MAX_IN_FLIGHT_PER_ORGANIZATION = 2;
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
  deferred?: boolean;
}

const inFlight = new Map<string, number>();

const acquireSlot = (organizationId: string): (() => void) | null => {
  const count = inFlight.get(organizationId) ?? 0;
  if (count >= MAX_IN_FLIGHT_PER_ORGANIZATION) {
    return null;
  }
  inFlight.set(organizationId, count + 1);
  return () => {
    const remaining = (inFlight.get(organizationId) ?? 1) - 1;
    if (remaining > 0) {
      inFlight.set(organizationId, remaining);
    } else {
      inFlight.delete(organizationId);
    }
  };
};

export const deliver = async (
  target: DeliveryTarget,
  secret: string,
  events: ReturnType<typeof toAuditEvent>[],
  now: () => Date = () => new Date(),
  signal?: AbortSignal,
): Promise<DeliveryResult> => {
  const deliveryId = randomUUID();
  const fail = (error: string, statusCode: number | null = null) => ({
    ok: false,
    statusCode,
    error: error.slice(0, 500),
    deliveryId,
  });

  const body = JSON.stringify({
    stream: { id: target.id, organizationId: target.organizationId },
    events,
  });
  const timestamp = Math.floor(now().getTime() / 1000);

  const release = acquireSlot(target.organizationId);
  if (!release) {
    return {
      ...fail(
        "Another delivery for this organization is in progress; try again shortly.",
      ),
      deferred: true,
    };
  }

  try {
    const { status } = await postToPublicUrl(target.url, {
      timeoutMs: DELIVERY_TIMEOUT_MS,
      signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "4mica-audit-stream/1",
        [SIGNATURE_HEADER]: signature(secret, timestamp, body),
        [DELIVERY_HEADER]: deliveryId,
      },
      body,
    });

    if (status >= 200 && status < 300) {
      return { ok: true, statusCode: status, error: null, deliveryId };
    }
    if (status >= 300 && status < 400) {
      return fail(
        "The endpoint redirected; redirects are not followed.",
        status,
      );
    }
    return fail(`The endpoint answered ${status}.`, status || null);
  } catch (error) {
    if (error instanceof UnsafeDestinationError) {
      return fail(error.message);
    }
    if (error instanceof OutboundAbortedError) {
      return { ...fail(error.message), deferred: true };
    }
    if (error instanceof OutboundTimeoutError) {
      return fail(
        error.phase === "dns"
          ? `The endpoint's DNS did not resolve within ${DELIVERY_TIMEOUT_MS / 1000}s.`
          : `The endpoint did not answer within ${DELIVERY_TIMEOUT_MS / 1000}s.`,
      );
    }
    return fail(
      `The endpoint could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    release();
  }
};
