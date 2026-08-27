import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import { Banner, type BannerData } from "../components/banner";

const POSTER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270">
       <rect width="480" height="270" fill="#123c4a"/>
       <text x="50%" y="50%" fill="#7BCBFF" font-family="sans-serif"
             font-size="22" text-anchor="middle">Walkthrough</text>
     </svg>`,
  );

const SAMPLE_VIDEO =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const BASE: BannerData = {
  id: "instant-payouts",
  title: "Instant payouts",
  message: "Settle to your wallet the moment a payment clears.",
  url: "https://4mica.io",
};

const meta = {
  title: "Components/Banner",
  component: Banner,
  parameters: { layout: "centered" },
  args: {
    banner: BASE,
    onDismiss: fn(),
    onLearnMore: fn(),
    onVideoPlay: fn(),
  },
  argTypes: {
    tone: { control: "inline-radio", options: ["default", "brand"] },
    size: { control: "inline-radio", options: ["sm", "md", "full"] },
    banner: { table: { disable: true } },
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TitleOnly: Story = {
  args: {
    banner: { id: "a", title: "Instant payouts", url: "https://4mica.io" },
  },
};

export const MessageOnly: Story = {
  args: {
    banner: {
      id: "b",
      message: "Settle to your wallet the moment a payment clears.",
      url: "https://4mica.io",
    },
  },
};

export const WithVideo: Story = {
  args: {
    banner: {
      ...BASE,
      thumbnailUrl: POSTER,
      videoUrl: SAMPLE_VIDEO,
      alt: "Instant payouts walkthrough",
      isVideo: true,
    },
  },
};

export const WithThumbnailOnly: Story = {
  args: {
    banner: { ...BASE, thumbnailUrl: POSTER, alt: "Instant payouts" },
  },
};

export const WithoutDismiss: Story = {
  args: { onDismiss: undefined },
};

export const WithoutLink: Story = {
  args: {
    banner: { id: "c", title: "Instant payouts", message: BASE.message },
  },
};

export const BrandTone: Story = {
  args: { tone: "brand" },
};

export const Wide: Story = {
  args: { size: "md" },
};

export const NoBanner: Story = {
  args: { banner: undefined },
};

const ControlledBanner = () => {
  const [data, setData] = useState<BannerData | undefined>(BASE);

  return (
    <div className="flex flex-col items-start gap-3">
      <Banner banner={data} onDismiss={() => setData(undefined)} />
      {!data && (
        <button
          type="button"
          className="text-ink-muted text-xs underline"
          onClick={() => setData(BASE)}
        >
          Bring it back
        </button>
      )}
    </div>
  );
};

export const ControlledDismissal: Story = {
  render: () => <ControlledBanner />,
};
