import type { FetchFn as HttpFetchFn } from "@/http";

export type FetchFn = HttpFetchFn;
export type BearerTokenProvider = () => string | Promise<string>;
