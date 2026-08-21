export const BANNER_INTERACTION = {
  VIEWED: "VIEWED",
  CLICKED: "CLICKED",
  DISMISSED: "DISMISSED",
  VIDEO_PLAYED: "VIDEO_PLAYED",
} as const;

export type BannerInteractionType =
  (typeof BANNER_INTERACTION)[keyof typeof BANNER_INTERACTION];

export interface Banner {
  id: string;
  title: string | null;
  message: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  alt: string | null;
  isVideo: boolean;
}

export interface BannerState {
  banners: Banner[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
}
