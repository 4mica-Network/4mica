import type { Breadcrumb, BrowserOptions, Event, Log } from "@sentry/nextjs";
import {
  createRecord,
  SENSITIVE_KEY,
  scrubRecord,
  scrubValue,
} from "./objects";
import { FILTERED, safeStringify, scrubText, scrubUrl } from "./text";

type StreamedSpanJSON = Parameters<
  NonNullable<BrowserOptions["beforeSendSpan"]>
>[0];

type Contexts = NonNullable<Event["contexts"]>;

type Exception = NonNullable<NonNullable<Event["exception"]>["values"]>[number];

type StackFrame = NonNullable<
  NonNullable<Exception["stacktrace"]>["frames"]
>[number];

type MechanismData = NonNullable<NonNullable<Exception["mechanism"]>["data"]>;

export const ALLOWED_HEADERS = new Set([
  "accept-language",
  "content-type",
  "host",
  "referer",
  "user-agent",
]);

const USER_ATTRIBUTE = /^user\./i;

export const REQUEST_ID_TAG = "request_id";
export const UPSTREAM_REQUEST_ID_TAG = "upstream_request_id";

export const ALLOWED_TAGS = new Set([
  REQUEST_ID_TAG,
  UPSTREAM_REQUEST_ID_TAG,
  "turbopack",
]);

export const ALLOWED_CONTEXTS = new Set([
  "app",
  "browser",
  "cloud_resource",
  "culture",
  "device",
  "flags",
  "nextjs",
  "os",
  "profile",
  "react",
  "response",
  "runtime",
  "trace",
]);

const HTTP_HEADER_ATTRIBUTE = /^http\.(request|response)\.header\.(.+)$/i;

const LOG_LEVELS = new Set<Log["level"]>([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

export const INVALID_TRACE_ID = "0".repeat(32);
export const INVALID_SPAN_ID = "0".repeat(16);

const TRACE_ID = /^(?!0{32})[0-9a-f]{32}$/;
const SPAN_ID = /^(?!0{16})[0-9a-f]{16}$/;

type SpanLink = NonNullable<StreamedSpanJSON["links"]>[number];

export const scrubContexts = (contexts: Contexts): Contexts => {
  const result = createRecord() as Contexts;

  for (const [name, context] of Object.entries(contexts)) {
    if (ALLOWED_CONTEXTS.has(name)) {
      result[name] = context ? scrubRecord(context) : context;
    }
  }

  return result;
};

const scrubTags = (tags: NonNullable<Event["tags"]>) => {
  const result = createRecord() as NonNullable<Event["tags"]>;

  for (const [key, value] of Object.entries(tags)) {
    if (!ALLOWED_TAGS.has(key) || SENSITIVE_KEY.test(key)) {
      continue;
    }

    result[key] = typeof value === "string" ? scrubText(value) : value;
  }

  return result;
};

const scrubOptionalText = (text: string | undefined) =>
  text === undefined ? text : scrubText(text);

const scrubFrame = (frame: StackFrame): StackFrame => {
  const scrubbed: StackFrame = {
    ...frame,
    filename: scrubOptionalText(frame.filename),
    abs_path: scrubOptionalText(frame.abs_path),
    function: scrubOptionalText(frame.function),
    module: scrubOptionalText(frame.module),
    context_line: frame.context_line && scrubText(frame.context_line),
    pre_context: frame.pre_context?.map(scrubText),
    post_context: frame.post_context?.map(scrubText),
  };

  delete scrubbed.vars;
  return scrubbed;
};

const scrubMechanismData = (data: MechanismData): MechanismData => {
  const result = createRecord() as MechanismData;

  for (const [key, value] of Object.entries(scrubRecord(data))) {
    result[key] =
      typeof value === "string" || typeof value === "boolean"
        ? value
        : safeStringify(value);
  }

  return result;
};

const scrubException = (exception: Exception): Exception => ({
  ...exception,
  type: scrubOptionalText(exception.type),
  module: scrubOptionalText(exception.module),
  value: exception.value && scrubText(exception.value),
  mechanism: exception.mechanism && {
    ...exception.mechanism,
    data:
      exception.mechanism.data && scrubMechanismData(exception.mechanism.data),
  },
  stacktrace: exception.stacktrace && {
    ...exception.stacktrace,
    frames: exception.stacktrace.frames?.map(scrubFrame),
  },
});

const pickHeaders = (headers: Record<string, string> | undefined) => {
  if (!headers) {
    return undefined;
  }

  const kept = createRecord() as Record<string, string>;

  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();

    if (ALLOWED_HEADERS.has(key)) {
      kept[key] = scrubText(value);
    }
  }

  return kept;
};

export const scrubBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
  const scrubbed: Breadcrumb = {
    ...breadcrumb,
    message: breadcrumb.message && scrubText(breadcrumb.message),
  };

  if (scrubbed.category === "console") {
    delete scrubbed.data;
    return scrubbed;
  }

  if (scrubbed.data) {
    scrubbed.data = scrubRecord(scrubbed.data);
  }

  return scrubbed;
};

export const scrubEvent = <T extends Event>(event: T): T => {
  if (event.request) {
    const { method, url, headers } = event.request;
    event.request = {
      method,
      url: url ? scrubText(scrubUrl(url)) : url,
      headers: pickHeaders(headers),
    };
  }

  delete event.user;
  delete event.extra;

  if (event.message) {
    event.message = scrubText(event.message);
  }

  if (event.logentry) {
    event.logentry = {
      message: event.logentry.message && scrubText(event.logentry.message),
      params: event.logentry.params?.map((param) => scrubValue(param)),
    };
  }

  if (event.transaction) {
    event.transaction = scrubText(scrubUrl(event.transaction));
  }

  if (event.fingerprint) {
    event.fingerprint = event.fingerprint.map((part) =>
      typeof part === "string" ? scrubText(part) : FILTERED,
    );
  }

  if (event.tags) {
    event.tags = scrubTags(event.tags);
  }

  if (event.exception?.values) {
    event.exception = {
      ...event.exception,
      values: event.exception.values.map(scrubException),
    };
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }

  if (event.contexts) {
    event.contexts = scrubContexts(event.contexts);
  }

  return event;
};

const isAllowedHeaderAttribute = (key: string) => {
  const match = HTTP_HEADER_ATTRIBUTE.exec(key);

  if (!match) {
    return true;
  }

  const [, direction, header] = match;

  return (
    direction?.toLowerCase() === "request" &&
    header !== undefined &&
    ALLOWED_HEADERS.has(header.replace(/_/g, "-").toLowerCase())
  );
};

const scrubSpanAttributes = (
  attributes: StreamedSpanJSON["attributes"] | undefined,
) => {
  const scrubbed = scrubRecord(attributes ?? {});

  delete scrubbed["url.query"];
  delete scrubbed["http.query"];

  for (const key of Object.keys(scrubbed)) {
    if (USER_ATTRIBUTE.test(key) || !isAllowedHeaderAttribute(key)) {
      delete scrubbed[key];
    }
  }

  return scrubbed;
};

const scrubLink = (link: SpanLink): SpanLink => ({
  trace_id: link.trace_id,
  span_id: link.span_id,
  ...(typeof link.sampled === "boolean" ? { sampled: link.sampled } : {}),
  ...(link.attributes
    ? { attributes: scrubSpanAttributes(link.attributes) }
    : {}),
});

export const scrubSpan = (span: StreamedSpanJSON): StreamedSpanJSON => ({
  trace_id: span.trace_id,
  span_id: span.span_id,
  ...(span.parent_span_id === undefined
    ? {}
    : { parent_span_id: span.parent_span_id }),
  name: scrubText(span.name),
  start_timestamp: span.start_timestamp,
  ...(span.end_timestamp === undefined
    ? {}
    : { end_timestamp: span.end_timestamp }),
  status: span.status,
  is_segment: span.is_segment,
  attributes: scrubSpanAttributes(span.attributes),
  ...(span.links ? { links: span.links.map(scrubLink) } : {}),
});

export const scrubLog = (log: Log): Log => ({
  level: LOG_LEVELS.has(log.level) ? log.level : "error",
  message: scrubText(String(log.message)),
  ...(log.attributes
    ? { attributes: scrubSpanAttributes(log.attributes) }
    : {}),
  ...(typeof log.severityNumber === "number" &&
  Number.isFinite(log.severityNumber)
    ? { severityNumber: log.severityNumber }
    : {}),
});

const read = <T>(
  span: StreamedSpanJSON,
  key: keyof StreamedSpanJSON,
  accept: (value: unknown) => value is T,
  fallback: T,
): T => {
  try {
    const value = span[key];
    return accept(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

const isTraceId = (value: unknown): value is string =>
  typeof value === "string" && TRACE_ID.test(value);
const isSpanId = (value: unknown): value is string =>
  typeof value === "string" && SPAN_ID.test(value);
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
const isStatus = (value: unknown): value is "ok" | "error" =>
  value === "ok" || value === "error";
const isOptionalSpanId = (value: unknown): value is string | undefined =>
  value === undefined || isSpanId(value);
const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || isNumber(value);

export const strippedSpan = (span: StreamedSpanJSON): StreamedSpanJSON => ({
  trace_id: read(span, "trace_id", isTraceId, INVALID_TRACE_ID),
  span_id: read(span, "span_id", isSpanId, INVALID_SPAN_ID),
  parent_span_id: read(span, "parent_span_id", isOptionalSpanId, undefined),
  start_timestamp: read(span, "start_timestamp", isNumber, 0),
  end_timestamp: read(span, "end_timestamp", isOptionalNumber, undefined),
  status: read(span, "status", isStatus, "error"),
  is_segment: read(span, "is_segment", isBoolean, false),
  name: FILTERED,
  attributes: {},
});

export const safeScrubSpan = (span: StreamedSpanJSON): StreamedSpanJSON => {
  try {
    return scrubSpan(span);
  } catch {
    return strippedSpan(span);
  }
};

const failClosed =
  <A extends unknown[], R>(scrub: (...args: A) => R) =>
  (...args: A): R | null => {
    try {
      return scrub(...args);
    } catch {
      return null;
    }
  };

export const safeScrubEvent = failClosed(scrubEvent);
export const safeScrubBreadcrumb = failClosed(scrubBreadcrumb);
export const safeScrubLog = failClosed(scrubLog);

interface TaggableScope {
  setTag(key: string, value: string): unknown;
}

export const tagRequest = (
  scope: TaggableScope,
  ids: { requestId?: string; upstreamRequestId?: string },
) => {
  if (ids.requestId) {
    scope.setTag(REQUEST_ID_TAG, ids.requestId);
  }

  if (ids.upstreamRequestId) {
    scope.setTag(UPSTREAM_REQUEST_ID_TAG, ids.upstreamRequestId);
  }
};

interface DynamicSamplingContext {
  transaction?: string;
}

export const scrubDynamicSamplingContext = (dsc: DynamicSamplingContext) => {
  if (dsc.transaction === undefined) {
    return;
  }

  try {
    dsc.transaction = scrubText(scrubUrl(dsc.transaction));
  } catch {
    dsc.transaction = FILTERED;
  }
};

interface HookableClient {
  on(
    hook: "createDsc",
    callback: (dsc: DynamicSamplingContext) => void,
  ): () => void;
}

export const telemetryScrubbingIntegration = () => ({
  name: "TelemetryScrubbing",
  setup(client: HookableClient) {
    client.on("createDsc", scrubDynamicSamplingContext);
  },
});
