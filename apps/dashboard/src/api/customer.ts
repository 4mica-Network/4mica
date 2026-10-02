import { HttpMethod } from "@4mica/http";
import type {
  BatchDeleteResult,
  Customer,
  CustomerActivityResponse,
  CustomerCreditBalance,
  CustomerCreditEntry,
  CustomerCreditKind,
  CustomerIdentitySource,
  CustomerIdentityType,
  CustomerListResponse,
  CustomerOverview,
  CustomerQuotaPeriod,
  CustomerQuotaUnit,
  CustomerSort,
  CustomerStatus,
  CustomerType,
  PaymentNetwork,
  PaymentStatus,
} from "@stores/customer/type";
import { httpClient } from "./client";

export interface ListCustomersParams
  extends Record<string, string | number | boolean | undefined> {
  page?: number;
  limit?: number;
  q?: string;
  type?: CustomerType;
  status?: CustomerStatus;
  network?: PaymentNetwork;
  source?: CustomerIdentitySource;
  sort?: CustomerSort;
}

export interface CustomerActivityParams
  extends Record<string, string | number | boolean | undefined> {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  network?: PaymentNetwork;
  sort?: "createdAt" | "-createdAt" | "amount" | "-amount";
}

export interface CustomerIdentityInput {
  type: CustomerIdentityType;
  network?: PaymentNetwork;
  address?: string;
  value?: string;
  source?: CustomerIdentitySource;
  validFrom?: string | null;
  validUntil?: string | null;
}

export type CustomerStatusInput =
  | { status: "ACTIVE" }
  | { status: "BLOCKED"; reason?: string | null }
  | { status: "SUSPENDED"; suspendedUntil: string; reason?: string | null };

export interface CustomerInput {
  name: string;
  email?: string | null;
  type?: CustomerType;
  description?: string | null;
  notes?: string | null;
  dailyLimit?: string | null;
  monthlyLimit?: string | null;
  limitCurrency?: string;
  identities?: CustomerIdentityInput[];
}

export interface CustomerIdentityPatch {
  source?: CustomerIdentitySource;
  validFrom?: string | null;
  validUntil?: string | null;
  blocked?: boolean;
}

export const getCustomers = (params: ListCustomersParams = {}) =>
  httpClient.request<CustomerListResponse>({
    url: "/me/customers",
    method: HttpMethod.GET,
    params,
  });

export const getCustomer = (id: string) =>
  httpClient.request<Customer>({
    url: `/me/customers/${encodeURIComponent(id)}`,
    method: HttpMethod.GET,
  });

export const createCustomer = (data: CustomerInput) =>
  httpClient.request<Customer, typeof data>({
    url: "/me/customers",
    method: HttpMethod.POST,
    data,
  });

export const updateCustomer = (id: string, data: Partial<CustomerInput>) =>
  httpClient.request<Customer, typeof data>({
    url: `/me/customers/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const setCustomerStatus = (id: string, data: CustomerStatusInput) =>
  httpClient.request<Customer, typeof data>({
    url: `/me/customers/${encodeURIComponent(id)}/status`,
    method: HttpMethod.PATCH,
    data,
  });

export interface CustomerPolicyInput {
  freeQuotaUnit?: CustomerQuotaUnit | null;
  freeQuota?: string | null;
  freeQuotaPeriod?: CustomerQuotaPeriod | null;
  discountPercent?: string | null;
  discountFixed?: string | null;
  minPaymentAmount?: string | null;
  approvalThreshold?: string | null;
}

export const setCustomerPolicy = (id: string, data: CustomerPolicyInput) =>
  httpClient.request<Customer, typeof data>({
    url: `/me/customers/${encodeURIComponent(id)}/policy`,
    method: HttpMethod.PATCH,
    data,
  });

export const resetCustomerUsage = (id: string) =>
  httpClient.request<Customer>({
    url: `/me/customers/${encodeURIComponent(id)}/reset-usage`,
    method: HttpMethod.POST,
  });

export interface CustomerCreditInput {
  kind: CustomerCreditKind;
  amount: string;
  reason?: string | null;
}

export const getCustomerCredit = (id: string) =>
  httpClient.request<{
    balance: CustomerCreditBalance;
    items: CustomerCreditEntry[];
  }>({
    url: `/me/customers/${encodeURIComponent(id)}/credit`,
    method: HttpMethod.GET,
  });

export const grantCustomerCredit = (id: string, data: CustomerCreditInput) =>
  httpClient.request<
    { balance: CustomerCreditBalance; entry: CustomerCreditEntry },
    typeof data
  >({
    url: `/me/customers/${encodeURIComponent(id)}/credit`,
    method: HttpMethod.POST,
    data,
  });

export const zeroCustomerCredit = (id: string) =>
  httpClient.request<{
    balance: CustomerCreditBalance;
    items: CustomerCreditEntry[];
  }>({
    url: `/me/customers/${encodeURIComponent(id)}/credit`,
    method: HttpMethod.DELETE,
  });

export const deleteCustomer = (id: string) =>
  httpClient.request<void>({
    url: `/me/customers/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });

export const batchDeleteCustomers = (ids: string[]) =>
  httpClient.request<BatchDeleteResult, { ids: string[] }>({
    url: "/me/customers/batch-delete",
    method: HttpMethod.POST,
    data: { ids },
  });

export const addCustomerIdentity = (id: string, data: CustomerIdentityInput) =>
  httpClient.request<Customer, typeof data>({
    url: `/me/customers/${encodeURIComponent(id)}/identities`,
    method: HttpMethod.POST,
    data,
  });

export const updateCustomerIdentity = (
  id: string,
  identityId: string,
  data: CustomerIdentityPatch,
) =>
  httpClient.request<Customer, typeof data>({
    url: `/me/customers/${encodeURIComponent(id)}/identities/${encodeURIComponent(identityId)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const removeCustomerIdentity = (id: string, identityId: string) =>
  httpClient.request<void>({
    url: `/me/customers/${encodeURIComponent(id)}/identities/${encodeURIComponent(identityId)}`,
    method: HttpMethod.DELETE,
  });

export const getCustomerOverview = (id: string) =>
  httpClient.request<CustomerOverview>({
    url: `/me/customers/${encodeURIComponent(id)}/overview`,
    method: HttpMethod.GET,
  });

export const getCustomerActivity = (
  id: string,
  params: CustomerActivityParams = {},
) =>
  httpClient.request<CustomerActivityResponse>({
    url: `/me/customers/${encodeURIComponent(id)}/activity`,
    method: HttpMethod.GET,
    params,
  });
