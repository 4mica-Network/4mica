import { HttpMethod } from "@4mica/http";
import type { AppConfig } from "@stores/config/type";
import { httpClient } from "./client";

export const getConfig = (version?: string) =>
  httpClient.request<AppConfig>({
    url: "/config",
    method: HttpMethod.GET,
    headers: version ? { "If-None-Match": `"${version}"` } : {},
  });
