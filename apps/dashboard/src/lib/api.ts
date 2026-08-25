import { useAuth } from "@clerk/clerk-react";
import { useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

export function useApi(): ApiFetch {
  const { getToken, signOut } = useAuth();

  return useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const send = async (skipCache: boolean): Promise<Response> => {
        const token = await getToken({ skipCache });
        const headers = new Headers(init.headers);

        headers.set("Accept", "application/json");

        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        if (init.body && !headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }

        return fetch(`${API_URL}${path}`, { ...init, headers });
      };

      let response = await send(false);

      if (response.status === 401) {
        response = await send(true);
      }

      if (response.status === 401) {
        await signOut({ redirectUrl: "/sign-in" });
        throw new ApiError(401, "Session expired");
      }

      if (!response.ok) {
        throw new ApiError(response.status, await response.text());
      }

      return (await response.json()) as T;
    },
    [getToken, signOut],
  );
}
