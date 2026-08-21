import { AutoStackHeight, Banner as BannerCard } from "@4mica/ui";
import {
  dismissBanner,
  fetchBanners,
  recordBannerInteraction,
} from "@stores/banner/actions";
import { selectBanners } from "@stores/banner/selector";
import type { Banner } from "@stores/banner/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { useLocalStorageState } from "ahooks";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

const DISMISSED_KEY = "4mica:banners:dismissed";

export function SidebarBanners() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const banners = useAppSelector(selectBanners);
  const userId = useAppSelector(selectUser)?.id;

  const [dismissedIds, setDismissedIds] = useLocalStorageState<string[]>(
    DISMISSED_KEY,
    { defaultValue: [], listenStorageChange: true },
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    dispatch(fetchBanners());
  }, [dispatch, userId]);

  const visible = useMemo(
    () => banners.filter((item) => !dismissedIds?.includes(item.id)),
    [banners, dismissedIds],
  );

  const reported = useRef(new Set<string>());

  useEffect(() => {
    for (const item of visible) {
      if (reported.current.has(item.id)) {
        continue;
      }
      reported.current.add(item.id);
      dispatch(recordBannerInteraction(item.id, "VIEWED"));
    }
  }, [visible, dispatch]);

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
