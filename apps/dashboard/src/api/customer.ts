import { HttpMethod } from "@4mica/http";
import type {
  BatchDeleteResult,
  Customer,
  CustomerActivityResponse,
  CustomerIdentitySource,
  CustomerIdentityType,
  CustomerListResponse,
  CustomerOverview,
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

export interface CustomerInput {
  name: string;
  email?: string | null;
  type?: CustomerType;
  status?: CustomerStatus;
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
