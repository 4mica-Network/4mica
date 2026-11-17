import { AutoStackHeight, Banner as BannerCard } from "@4mica/ui";
import {
  dismissBanner,
  fetchBanners,
  recordBannerInteraction,
} from "@stores/banner/actions";
import {
  selectBanners,
  selectHasLoadedBanners,
  selectIsLoadingBanners,
  selectViewedBannerIds,
} from "@stores/banner/selector";
import type { Banner } from "@stores/banner/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { useLocalStorageState } from "ahooks";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

const DISMISSED_KEY = "4mica:banners:dismissed";

export function SidebarBanners() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const banners = useAppSelector(selectBanners);
  const hasLoaded = useAppSelector(selectHasLoadedBanners);
  const isLoading = useAppSelector(selectIsLoadingBanners);
  const viewedIds = useAppSelector(selectViewedBannerIds);
  const userId = useAppSelector(selectUser)?.id;

  const [dismissedIds, setDismissedIds] = useLocalStorageState<string[]>(
    DISMISSED_KEY,
    { defaultValue: [], listenStorageChange: true },
  );

  useEffect(() => {
    if (!userId || hasLoaded || isLoading) {
      return;
    }
    dispatch(fetchBanners());
  }, [dispatch, userId, hasLoaded, isLoading]);

  const visible = useMemo(
    () => banners.filter((item) => !dismissedIds?.includes(item.id)),
    [banners, dismissedIds],
  );

  useEffect(() => {
    for (const item of visible) {
      if (!viewedIds.includes(item.id)) {
        dispatch(recordBannerInteraction(item.id, "VIEWED"));
      }
    }
  }, [visible, viewedIds, dispatch]);

  const handleDismiss = (item: Banner) => {
    setDismissedIds([...(dismissedIds ?? []), item.id]);
    dispatch(dismissBanner(item));
  };

  if (visible.length === 0) {
    return null;
  }

  return (
    <AutoStackHeight
      items={visible}
      width="100%"
      className="pb-3"
      renderItem={(item) => (
        <BannerCard
          size="full"
          banner={{
            id: item.id,
            title: item.title ?? undefined,
            message: item.message ?? undefined,
            url: item.url ?? undefined,
            thumbnailUrl: item.thumbnailUrl ?? undefined,
            videoUrl: item.videoUrl ?? undefined,
            alt: item.alt ?? undefined,
            isVideo: item.isVideo,
          }}
          learnMoreLabel={t("banner.learnMore")}
          dismissLabel={t("banner.dismiss")}
          onDismiss={() => handleDismiss(item)}
          onLearnMore={() =>
            dispatch(recordBannerInteraction(item.id, "CLICKED"))
          }
          onVideoPlay={() =>
            dispatch(recordBannerInteraction(item.id, "VIDEO_PLAYED"))
          }
          data-testid="sidebar"
        />
      )}
      data-testid="sidebar"
    />
  );
}
