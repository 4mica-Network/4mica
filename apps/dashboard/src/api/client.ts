import {
  HttpClient,
  HttpMethod,
  type HttpRequestConfig,
  resolveRequestHeaders,
} from "@4mica/http";
import i18n from "@i18n";
import { CANCEL } from "redux-saga";
import { accessErrorOf, reportAccessError } from "@/lib/accessErrors";
import {
  ApprovalRequiredError,
  captureRequest,
  isApprovalRequiredBody,
  rememberRequest,
  type StoredRequest,
} from "@/lib/approvalRequests";
import { notifyInfo } from "@/lib/notify";
import { withReauth } from "@/lib/reauth";
import { LOCAL_API_URL, requireTrustedApiUrl } from "./apiUrl";

export { setAuthTokenProvider, setUnauthorizedHandler } from "@4mica/http";

export const API_URL = import.meta.env.PROD
  ? requireTrustedApiUrl(import.meta.env.VITE_API_URL)
  : import.meta.env.VITE_API_URL?.trim() || LOCAL_API_URL;

type Cancellable<T> = Promise<T> & { [CANCEL]?: () => void };

const withCancel = <T>(promise: Promise<T>, cancel: () => void): Promise<T> =>
  Object.assign(promise, { [CANCEL]: cancel });

export const mapResponse = <T, U>(
  source: Promise<T>,
  map: (value: T) => U | Promise<U>,
): Promise<U> => {
  const cancel = (source as Cancellable<T>)[CANCEL];
  const mapped = source.then(map);
  return cancel ? withCancel(mapped, cancel) : mapped;
};

export const settleGoverned = <T>(
  captured: StoredRequest | null,
  result: T,
): T => {
  if (!captured || !isApprovalRequiredBody(result)) {
    return result;
  }
  const { approvalRequest } = result;
  rememberRequest(approvalRequest.id, {
    ...captured,
    summary: approvalRequest.summary ?? "",
  });
  notifyInfo({
    title: i18n.t("approval.sent.title"),
    content: i18n.t("approval.sent.body", {
      count: approvalRequest.requiredApprovals,
    }),
  });
  throw new ApprovalRequiredError(result);
};

class SagaAwareHttpClient extends HttpClient {
  override request<TResponse, TData = unknown>(
    config: HttpRequestConfig<TData>,
  ): Promise<TResponse> {
    const controller = new AbortController();
    const caller = config.signal;
    if (caller?.aborted) {
      controller.abort(caller.reason);
    } else {
      caller?.addEventListener("abort", () => controller.abort(caller.reason), {
        once: true,
      });
    }

    const captured =
      config.method === HttpMethod.GET || config.skipAuth
        ? null
        : captureRequest(config, resolveRequestHeaders());

    const send = () =>
      super.request<TResponse, TData>({ ...config, signal: controller.signal });

    return withCancel(
      withReauth(send)
        .then((result) => settleGoverned(captured, result))
        .catch((error: unknown) => {
          reportAccessError(accessErrorOf(error));
          throw error;
        }),
      () => controller.abort(),
    );
  }
}

export const httpClient = new SagaAwareHttpClient(API_URL);
