import type { Meta, StoryObj } from "@storybook/react";
import { ExternalLink } from "lucide-react";
import { Typography, type TypographyTextProps } from "../components/typography";

const meta = {
  title: "Components/Typography",
  component: Typography,
  parameters: { layout: "centered" },
  args: { children: "The credit layer for the agentic economy." },
  argTypes: {
    variant: {
      control: "select",
      options: ["heading", "default", "subtle"],
    },
    size: {
      control: "select",
      options: ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"],
    },
    weight: {
      control: "select",
      options: ["normal", "medium", "semibold", "bold"],
    },
    as: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<TypographyTextProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Heading: Story = {
  args: { variant: "heading", size: "lg", children: "Balances" },
};

export const Subtle: Story = {
  args: { variant: "subtle", children: "Updated a few seconds ago." },
};

export const LinkStory: Story = {
  name: "Link",
  render: () => (
    <Typography variant="link" href="https://4mica.io">
      Read the docs
    </Typography>
  ),
};

export const MutedLink: Story = {
  render: () => (
    <Typography variant="link" tone="muted" href="https://4mica.io">
      Learn more
    </Typography>
  ),
};

export const ExternalLinkStory: Story = {
  name: "External Link",
  render: () => (
    <Typography
      variant="link"
      href="https://4mica.io"
      external
      icon={<ExternalLink size={12} />}
    >
      Open the dashboard
    </Typography>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {(["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const).map(
        (size) => (
          <Typography {...args} key={size} size={size}>
            {`size="${size}"`}
          </Typography>
        ),
      )}
    </div>
  ),
};

export const Weights: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {(["normal", "medium", "semibold", "bold"] as const).map((weight) => (
        <Typography {...args} key={weight} weight={weight}>
          {`weight="${weight}"`}
        </Typography>
      ))}
    </div>
  ),
};

export const HeadingLevels: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {(["h1", "h2", "h3", "h4"] as const).map((as) => (
        <Typography {...args} key={as} variant="heading" as={as} size="lg">
          {`as="${as}"`}
        </Typography>
      ))}
    </div>
  ),
};

export const InlineInCopy: Story = {
  render: () => (
    <p className="text-ink-body text-sm">
      Settlement runs nightly.{" "}
      <Typography as="span" weight="semibold">
        Payouts land the next business day
      </Typography>
      , and you can{" "}
      <Typography variant="link" size="sm" href="https://4mica.io">
        track them here
      </Typography>
      .
    </p>
  ),
};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      {(["heading", "default", "subtle"] as const).map((variant) =>
        (["sm", "md", "lg"] as const).map((size) => (
          <Typography
            {...args}
            key={`${variant}-${size}`}
            variant={variant}
            size={size}
          >
            {`variant="${variant}" size="${size}"`}
          </Typography>
        )),
      )}
    </div>
  ),
};
