import type { HttpRequestConfig } from "@4mica/http";
import type { ApprovalRequest } from "@stores/finance/type";

export const APPROVAL_HEADER = "X-Approval-Id";
export const APPROVAL_STORAGE_KEY = "4mica.approvalRequests";
export const SCOPE_HEADERS = ["X-Org-Id", "X-Project-Id", "X-Environment"];

export interface StoredRequest {
  method: HttpRequestConfig["method"];
  url: string;
  params?: HttpRequestConfig["params"];
  data?: unknown;
  headers: Record<string, string>;
  summary: string;
  createdAt: string;
}

export interface ApprovalRequiredBody {
  status: "approval_required";
  message: string;
  approvalRequest: ApprovalRequest;
}

export class ApprovalRequiredError extends Error {
  readonly approvalRequest: ApprovalRequest;

  constructor(body: ApprovalRequiredBody) {
    super(body.message);
    this.name = "ApprovalRequiredError";
    this.approvalRequest = body.approvalRequest;
  }
}

export const isApprovalRequiredBody = (
  value: unknown,
): value is ApprovalRequiredBody => {
  const body = value as Partial<ApprovalRequiredBody> | null;
  return (
    typeof body === "object" &&
    body !== null &&
    body.status === "approval_required" &&
    typeof body.approvalRequest?.id === "string"
  );
};

export const sentForApproval = (
  error: unknown,
): error is ApprovalRequiredError => error instanceof ApprovalRequiredError;

const readAll = (): Record<string, StoredRequest> => {
  try {
    const raw = localStorage.getItem(APPROVAL_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, StoredRequest>)
      : {};
  } catch {
    return {};
  }
};

const writeAll = (requests: Record<string, StoredRequest>) => {
  try {
    if (Object.keys(requests).length === 0) {
      localStorage.removeItem(APPROVAL_STORAGE_KEY);
    } else {
      localStorage.setItem(APPROVAL_STORAGE_KEY, JSON.stringify(requests));
    }
  } catch {}
};

export const scopeHeaders = (
  ...sources: (Record<string, string> | undefined)[]
): Record<string, string> => {
  const merged: Record<string, string> = {};
  for (const source of sources) {
    for (const [name, value] of Object.entries(source ?? {})) {
      const known = SCOPE_HEADERS.find(
        (header) => header.toLowerCase() === name.toLowerCase(),
      );
      if (known) {
        merged[known] = value;
      }
    }
  }
  return merged;
};

export const captureRequest = (
  config: HttpRequestConfig,
  providerHeaders: Record<string, string>,
  summary = "",
): StoredRequest => ({
  method: config.method,
  url: config.url,
  ...(config.params ? { params: config.params } : {}),
  ...(config.data === undefined ? {} : { data: config.data }),
  headers: scopeHeaders(providerHeaders, config.headers),
  summary,
  createdAt: new Date().toISOString(),
});

export const rememberRequest = (id: string, request: StoredRequest) => {
  writeAll({ ...readAll(), [id]: request });
};

export const storedRequest = (id: string): StoredRequest | null =>
  readAll()[id] ?? null;

export const forgetRequest = (id: string) => {
  const all = readAll();
  if (id in all) {
    delete all[id];
    writeAll(all);
  }
};

export const replayConfig = (
  id: string,
  request: StoredRequest,
): HttpRequestConfig => ({
  method: request.method,
  url: request.url,
  ...(request.params ? { params: request.params } : {}),
  ...(request.data === undefined ? {} : { data: request.data }),
  headers: { ...request.headers, [APPROVAL_HEADER]: id },
});
