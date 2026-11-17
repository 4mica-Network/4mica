import { HttpClient, type HttpRequestConfig } from "@4mica/http";
import { CANCEL } from "redux-saga";
import { LOCAL_API_URL, requireTrustedApiUrl } from "./apiUrl";

export { setAuthTokenProvider } from "@4mica/http";

const API_URL = import.meta.env.PROD
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

    return withCancel(
      super.request<TResponse, TData>({ ...config, signal: controller.signal }),
      () => controller.abort(),
    );
  }
}

export const httpClient = new SagaAwareHttpClient(API_URL);
