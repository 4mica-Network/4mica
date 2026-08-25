import { HttpMethod } from "@4mica/http";
import type { Banner, BannerInteractionType } from "@stores/banner/type";
import { httpClient } from "./client";

export const getBanners = () =>
  httpClient.request<Banner[]>({ url: "/banners", method: HttpMethod.GET });

export const recordBannerInteraction = (
  id: string,
  type: BannerInteractionType,
) =>
  httpClient.request<void, { type: BannerInteractionType }>({
    url: `/banners/${id}/interactions`,
    method: HttpMethod.POST,
    data: { type },
  });
