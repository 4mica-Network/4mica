import {
  type DeliveryResult,
  type DeliveryTarget,
  deliver,
  streamSecret,
  toAuditEvent,
} from "@controllers/audit-streams/delivery";
import {
  type DueStream,
  dueStreams,
  EVENTS_PER_DELIVERY,
  pendingEvents,
  recordFailure,
  recordSuccess,
} from "./repository";

export const BASE_BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 3_600_000;
export const PAUSE_AFTER_FAILURES = 20;
export const MAX_BATCHES_PER_RUN = 10;

interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface StreamDeps {
  logger: Logger;
  signingKey: string | undefined;
  now?: () => Date;
  shouldStop?: () => boolean;
  signal?: AbortSignal;
  send?: (
    target: DeliveryTarget,
    secret: string,
    events: ReturnType<typeof toAuditEvent>[],
    now?: () => Date,
    signal?: AbortSignal,
  ) => Promise<DeliveryResult>;
}

export interface StreamSummary {
  streams: number;
  delivered: number;
  failed: number;
}

export const backoffMs = (failures: number): number =>
  Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, failures - 1), MAX_BACKOFF_MS);

const drain = async (
  stream: DueStream,
  key: string,
  deps: StreamDeps,
  now: () => Date,
): Promise<{ delivered: number; failed: boolean }> => {
  const send = deps.send ?? deliver;
  const secret = streamSecret(key, stream.id, stream.secretVersion);
  let cursor = stream.cursorId;
  let delivered = 0;

  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const rows = await pendingEvents({ ...stream, cursorId: cursor });
    const last = rows.at(-1);
    if (!last) {
      break;
    }

    const result = await send(
      stream,
      secret,
      rows.map(toAuditEvent),
      now,
      deps.signal,
    );
    if (result.deferred) {
      deps.logger.info("audit streams: delivery deferred to the next run", {
        streamId: stream.id,
      });
      return { delivered, failed: false };
    }
    if (!result.ok) {
      const failures = stream.consecutiveFailures + 1;
      const pause = failures >= PAUSE_AFTER_FAILURES;
      await recordFailure(stream, {
        statusCode: result.statusCode,
        error: result.error,
        failures,
        pause,
        nextAttemptAt: pause
          ? null
          : new Date(now().getTime() + backoffMs(failures)),
      });
      deps.logger.warn("audit streams: delivery failed", {
        streamId: stream.id,
        failures,
        paused: pause,
        statusCode: result.statusCode,
      });
      return { delivered, failed: true };
    }

    cursor = last.id;
    delivered += rows.length;
    await recordSuccess(stream, last.id, result.statusCode, now());
    stream = { ...stream, consecutiveFailures: 0 };
    if (rows.length < EVENTS_PER_DELIVERY || deps.shouldStop?.()) {
      break;
    }
  }

  return { delivered, failed: false };
};

export const runAuditStreams = async (
  deps: StreamDeps,
): Promise<StreamSummary> => {
  const now = deps.now ?? (() => new Date());
  const shouldStop = deps.shouldStop ?? (() => false);
  const summary: StreamSummary = { streams: 0, delivered: 0, failed: 0 };

  if (!deps.signingKey) {
    return summary;
  }

  for (const stream of await dueStreams(now())) {
    if (shouldStop()) {
      break;
    }
    summary.streams++;
    try {
      const result = await drain(stream, deps.signingKey, deps, now);
      summary.delivered += result.delivered;
      if (result.failed) {
        summary.failed++;
      }
    } catch (error) {
      summary.failed++;
      deps.logger.error("audit streams: run failed for a stream", {
        streamId: stream.id,
        error,
      });
    }
  }

  return summary;
};
