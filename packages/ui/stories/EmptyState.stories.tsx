import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Inbox, KeyRound, Webhook } from "lucide-react";
import { EmptyState } from "../components/empty-state";
import { Link } from "../components/link";

const meta = {
  title: "Components/EmptyState",
  component: EmptyState,
  parameters: { layout: "centered" },
  args: { title: "No API keys yet" },
  argTypes: {
    variant: { control: "inline-radio", options: ["card", "plain"] },
    size: { control: "inline-radio", options: ["sm", "md"] },
    action: { table: { disable: true } },
    icon: { table: { disable: true } },
  },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The minimum: a bordered card with one line saying what is missing. */
export const Default: Story = {};

/** The description is the second sentence — what to do about it. */
export const WithDescription: Story = {
  args: { description: "Create one to start calling the API." },
};

/** Any ReactNode works as the icon; it inherits the muted text colour. */
export const WithIcon: Story = {
  args: {
    icon: <KeyRound size={20} />,
    description: "Create one to start calling the API.",
  },
};

/** The object form of `action` renders the standard invert Button. */
export const WithAction: Story = {
  args: {
    icon: <Webhook size={20} />,
    title: "No endpoints yet",
    description: "Add one to start receiving events.",
    action: { label: "Add endpoint", onClick: fn() },
  },
};

/**
 * A Server Component cannot pass `onClick`, so `action` also takes a ReactNode
 * — a link CTA needs no client boundary.
 */
export const WithNodeAction: Story = {
  args: {
    icon: <Inbox size={20} />,
    title: "No published APIs yet",
    description: "Publish one to show it here.",
    action: <Link href="https://4mica.io">Go to the dashboard</Link>,
  },
};

/** `plain` drops the border, for use inside a container that draws its own. */
export const Plain: Story = {
  args: { variant: "plain", description: "Publish one to show it here." },
  decorators: [
    (Story) => (
      <div className="w-[560px] rounded-xl border border-overlay/10">
        <Story />
      </div>
    ),
  ],
};

/** `sm` tightens the padding for a placeholder tucked inside a section. */
export const Compact: Story = {
  args: { variant: "plain", size: "sm", title: "No priced endpoints yet" },
};

export const Variants: Story = {
  render: (args) => (
    <div className="flex w-[560px] flex-col gap-4">
      {(["card", "plain"] as const).map((variant) =>
        (["md", "sm"] as const).map((size) => (
          <EmptyState
            {...args}
            key={`${variant}-${size}`}
            variant={variant}
            size={size}
            title={`variant="${variant}" size="${size}"`}
            description="Create one to start calling the API."
          />
        )),
      )}
    </div>
  ),
};
