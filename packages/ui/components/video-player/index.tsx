import { cva, type VariantProps } from "class-variance-authority";
import { Play } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../../lib/cn";

const videoPlayer = cva(
  "group relative w-full overflow-hidden bg-surface-deep",
  {
    variants: {
      ratio: {
        "16/9": "aspect-video",
        "4/3": "aspect-[4/3]",
        "1/1": "aspect-square",
        auto: "",
      },
      rounded: {
        none: "rounded-none",
        sm: "rounded-md",
        md: "rounded-lg",
        lg: "rounded-xl",
      },
    },
    defaultVariants: { ratio: "16/9", rounded: "md" },
  },
);

export interface VideoPlayerCaptions {
  src: string;
  srcLang?: string;
  label?: string;
}

export interface VideoPlayerProps extends VariantProps<typeof videoPlayer> {
  url: string;
  videoUrl?: string;
  alt: string;
  isVideo?: boolean;
  onPlay?: () => void;
  playLabel?: string;
  captions?: VideoPlayerCaptions;
  thumbnail?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export const VideoPlayer = ({
  url,
  videoUrl,
  alt,
  isVideo,
  onPlay,
  playLabel,
  captions,
  thumbnail,
  ratio,
  rounded,
  className,
  ...props
}: VideoPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-video-player`
    : "video-player";

  const playable = (isVideo ?? Boolean(videoUrl)) && Boolean(videoUrl);

  const frame = cn(videoPlayer({ ratio, rounded }), className);

  const poster = thumbnail ?? (
    <img
      src={url}
      alt={playable ? "" : alt}
      className="h-full w-full object-cover"
      data-testid={`${prefix}-thumbnail`}
    />
  );

  if (isPlaying && videoUrl) {
    return (
      <div className={frame} data-testid={prefix} data-playing="true">
        {/* biome-ignore lint/a11y/useMediaCaption: caption tracks are opt-in via `captions`. */}
        <video
          ref={(node) => {
            node?.play().catch(() => {});
          }}
          src={videoUrl}
          poster={url}
          controls
          playsInline
          className="h-full w-full object-cover"
          data-testid={`${prefix}-video`}
        >
          {captions && (
            <track
              kind="captions"
              src={captions.src}
              srcLang={captions.srcLang ?? "en"}
              label={captions.label ?? "English"}
              default
            />
          )}
        </video>
      </div>
    );
  }

  if (!playable) {
    return (
      <div className={frame} data-testid={prefix} data-playable="false">
        {poster}
      </div>
    );
  }

  return (
    <div className={frame} data-testid={prefix} data-playable="true">
      <button
        type="button"
        aria-label={playLabel ?? `Play video: ${alt}`}
        onClick={() => {
          setIsPlaying(true);
          onPlay?.();
        }}
        className="absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-overlay/40"
        data-testid={`${prefix}-play-button`}
      >
        {poster}
        <span className="absolute inset-0 bg-surface-deep/30 transition-colors group-hover:bg-surface-deep/45" />
        <span
          className="pointer-events-none absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-solid/85 text-ink-strong shadow-sm backdrop-blur-sm transition-transform group-focus-visible:scale-105 motion-safe:group-hover:scale-105"
          data-testid={`${prefix}-play-icon`}
        >
          <Play className="h-5 w-5 fill-current" />
        </span>
      </button>
    </div>
  );
};

VideoPlayer.displayName = "VideoPlayer";
