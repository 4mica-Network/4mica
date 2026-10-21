import { HttpMethod } from "@4mica/http";
import type {
  BeneficialOwner,
  BeneficialOwnerInput,
  ComplianceSnapshot,
  ComplianceUpdate,
} from "@stores/compliance/type";
import { httpClient } from "./client";

export const getCompliance = () =>
  httpClient.request<ComplianceSnapshot>({
    url: "/me/compliance",
    method: HttpMethod.GET,
  });

export const updateCompliance = (data: ComplianceUpdate) =>
  httpClient.request<ComplianceSnapshot, ComplianceUpdate>({
    url: "/me/compliance",
    method: HttpMethod.PATCH,
    data,
  });

export const submitCompliance = () =>
  httpClient.request<ComplianceSnapshot>({
    url: "/me/compliance/submit",
    method: HttpMethod.POST,
  });

export const createBeneficialOwner = (data: BeneficialOwnerInput) =>
  httpClient.request<BeneficialOwner, BeneficialOwnerInput>({
    url: "/me/compliance/owners",
    method: HttpMethod.POST,
    data,
  });

export const updateBeneficialOwner = (
  id: string,
  data: Partial<BeneficialOwnerInput>,
) =>
  httpClient.request<BeneficialOwner, Partial<BeneficialOwnerInput>>({
    url: `/me/compliance/owners/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const deleteBeneficialOwner = (id: string) =>
  httpClient.request<void>({
    url: `/me/compliance/owners/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });
