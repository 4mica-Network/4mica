import { HttpMethod } from "@4mica/http";
import type { UsernameUnavailableReason } from "@4mica/url";
import type { Business, User } from "@stores/user/type";
import { httpClient } from "./client";

export interface MeResponse {
  user: User;
  business: Business | null;
}

export const getMe = () =>
  httpClient.request<MeResponse>({ url: "/me", method: HttpMethod.GET });

export const updateProfile = (data: Partial<User>) =>
  httpClient.request<User, Partial<User>>({
    url: "/me/profile",
    method: HttpMethod.PATCH,
    data,
  });

export const updateAccount = (data: Partial<User>) =>
  httpClient.request<User, Partial<User>>({
    url: "/me/account",
    method: HttpMethod.PATCH,
    data,
  });

export const updateNotifications = (data: Partial<User>) =>
  httpClient.request<User, Partial<User>>({
    url: "/me/notifications",
    method: HttpMethod.PATCH,
    data,
  });

export type UsernameUnavailability = UsernameUnavailableReason | "taken";
export interface UsernameAvailability {
  username: string;
  available: boolean;
  reason: UsernameUnavailability | null;
}

export const checkUsernameAvailability = (username: string) =>
  httpClient.request<UsernameAvailability>({
    url: `/me/username-available?username=${encodeURIComponent(username)}`,
    method: HttpMethod.GET,
  });

export const getBusiness = () =>
  httpClient.request<Business | null>({
    url: "/me/business",
    method: HttpMethod.GET,
  });

export const upsertBusiness = (data: Partial<Business>) =>
  httpClient.request<Business, Partial<Business>>({
    url: "/me/business",
    method: HttpMethod.PUT,
    data,
  });
