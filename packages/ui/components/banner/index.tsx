import { cva, type VariantProps } from "class-variance-authority";
import { ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../button";
import { Typography } from "../typography";
import { VideoPlayer } from "../video-player";

const banner = cva(
  "flex w-full flex-col gap-2 rounded-lg border px-3.5 pt-4 pb-2 shadow-sm",
  {
    variants: {
      tone: {
        default: "border-overlay/10 bg-surface-solid",
        brand: "border-brand/25 bg-brand/10",
      },
      size: {
        sm: "max-w-52",
        md: "max-w-80",
        full: "max-w-none",
      },
    },
    defaultVariants: { tone: "default", size: "sm" },
  },
);

export interface BannerData {
  id: string;
  title?: string;
  message?: string;
  url?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  alt?: string;
  isVideo?: boolean;
}

export interface BannerProps extends VariantProps<typeof banner> {
  banner?: BannerData;
  onDismiss?: (banner: BannerData) => void;
  onLearnMore?: (banner: BannerData) => void;
  onVideoPlay?: (banner: BannerData) => void;
  learnMoreLabel?: string;
  dismissLabel?: string;
  "aria-label"?: string;
  className?: string;
  "data-testid"?: string;
}

export const Banner = ({
  banner: data,
  onDismiss,
  onLearnMore,
  onVideoPlay,
  learnMoreLabel = "Learn more",
  dismissLabel = "Dismiss",
  tone,
  size,
  className,
  ...props
}: BannerProps) => {
  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-banner`
    : "banner";

  if (!data) {
    return null;
  }

  return (
    <section
      aria-label={props["aria-label"] ?? data.title ?? "Announcement"}
      className={cn(banner({ tone, size }), className)}
      data-testid={prefix}
    >
      {(data.title || data.message) && (
        <div className="flex flex-col gap-1" data-testid={`${prefix}-content`}>
          {data.title && (
            <Typography
              variant="heading"
              size="sm"
              className="select-none"
              data-testid={`${prefix}-title`}
            >
              {data.title}
            </Typography>
          )}
          {data.message && (
            <Typography
              variant="subtle"
              size="xs"
              className="select-none"
              data-testid={`${prefix}-message`}
            >
              {data.message}
            </Typography>
          )}
        </div>
      )}

      {data.thumbnailUrl && (
        <VideoPlayer
          url={data.thumbnailUrl}
          videoUrl={data.videoUrl}
          alt={data.alt ?? data.title ?? "Banner media"}
          isVideo={data.isVideo}
          onPlay={() => onVideoPlay?.(data)}
          data-testid={prefix}
        />
      )}

      <div
        className="flex w-full items-center justify-between gap-2"
        data-testid={`${prefix}-actions`}
      >
        {data.url ? (
          <Typography
            variant="link"
            size="xs"
            tone="muted"
            href={data.url}
            external
            icon={<ExternalLink size={12} />}
            onClick={() => onLearnMore?.(data)}
            data-testid={`${prefix}-learn-more`}
          >
            {learnMoreLabel}
          </Typography>
        ) : (
          <span />
        )}

        {onDismiss && (
          <Button
            aria-label={dismissLabel}
            intent="ghost"
            size="sm"
            onClick={() => onDismiss(data)}
            className="p-0 text-ink-muted hover:bg-transparent hover:text-ink-strong hover:underline hover:underline-offset-2"
            data-testid={`${prefix}-dismiss-button`}
          >
            {dismissLabel}
          </Button>
        )}
      </div>
    </section>
  );
};

Banner.displayName = "Banner";
