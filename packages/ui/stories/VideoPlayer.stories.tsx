import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { VideoPlayer } from "../components/video-player";

const POSTER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%" stop-color="#0f2a2e"/><stop offset="100%" stop-color="#123c4a"/>
       </linearGradient></defs>
       <rect width="480" height="270" fill="url(#g)"/>
       <text x="50%" y="50%" fill="#7BCBFF" font-family="sans-serif"
             font-size="20" text-anchor="middle">Product walkthrough</text>
     </svg>`,
  );

const SAMPLE_VIDEO =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const meta = {
  title: "Components/VideoPlayer",
  component: VideoPlayer,
  parameters: { layout: "centered" },
  args: { url: POSTER, alt: "Product walkthrough", onPlay: fn() },
  argTypes: {
    ratio: { control: "inline-radio", options: ["16/9", "4/3", "1/1", "auto"] },
    rounded: { control: "inline-radio", options: ["none", "sm", "md", "lg"] },
    thumbnail: { table: { disable: true } },
    captions: { table: { disable: true } },
  },
  decorators: [
    (Story) => (
      <div className="w-[420px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof VideoPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playable: Story = {
  args: { videoUrl: SAMPLE_VIDEO },
};

export const WithCaptions: Story = {
  args: {
    videoUrl: SAMPLE_VIDEO,
    captions: { src: "/captions/walkthrough.en.vtt", srcLang: "en" },
  },
};

export const Ratios: Story = {
  args: { videoUrl: SAMPLE_VIDEO },
  render: (args) => (
    <div className="flex w-[420px] flex-col gap-4">
      {(["16/9", "4/3", "1/1"] as const).map((ratio) => (
        <VideoPlayer {...args} key={ratio} ratio={ratio} />
      ))}
    </div>
  ),
};

export const Rounded: Story = {
  render: (args) => (
    <div className="flex w-[420px] flex-col gap-4">
      {(["none", "sm", "md", "lg"] as const).map((rounded) => (
        <VideoPlayer {...args} key={rounded} rounded={rounded} />
      ))}
    </div>
  ),
};

export const CustomThumbnailNode: Story = {
  args: {
    videoUrl: SAMPLE_VIDEO,
    thumbnail: (
      <div className="grid h-full w-full place-items-center bg-brand/10 font-medium text-brand text-sm">
        Custom thumbnail node
      </div>
    ),
  },
};

export const AnalyticsCallback: Story = {
  args: { videoUrl: SAMPLE_VIDEO, onPlay: fn() },
};

export const PlaybackDisabled: Story = {
  args: { videoUrl: SAMPLE_VIDEO, isVideo: false },
};

export const InsideCard: Story = {
  args: { videoUrl: SAMPLE_VIDEO },
  decorators: [
    (Story) => (
      <div className="w-52 rounded-lg border border-overlay/10 bg-surface-solid p-3.5">
        <Story />
      </div>
    ),
  ],
};
