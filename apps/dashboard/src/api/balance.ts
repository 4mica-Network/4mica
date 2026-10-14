import { HttpMethod } from "@4mica/http";
import type { BalancesResponse } from "@stores/balance/type";
import { httpClient } from "./client";

export const getBalances = () =>
  httpClient.request<BalancesResponse>({
    url: "/me/balances",
    method: HttpMethod.GET,
  });
