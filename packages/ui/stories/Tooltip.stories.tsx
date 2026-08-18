import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "../components/link";
import { Tooltip, type TooltipProps } from "../components/tooltip";

const PLACEMENTS = [
  "top",
  "topLeft",
  "topRight",
  "bottom",
  "bottomLeft",
  "bottomRight",
  "left",
  "right",
  "center",
] as const;

const meta = {
  title: "Components/Tooltip",
  component: Tooltip,
  parameters: { layout: "centered" },
  args: {
    title: "Available credit refreshes every 24 hours.",
    children: (
      <button type="button" className="btn btn-outline btn-md">
        Hover me
      </button>
    ),
    onOpenChange: fn(),
  },
  argTypes: {
    placement: { control: "select", options: PLACEMENTS },
    trigger: { control: "inline-radio", options: ["hover", "manual"] },
    delay: { control: { type: "number" } },
    disabled: { control: "boolean" },
    interactive: { control: "boolean" },
    defaultOpen: { control: "boolean" },
    open: { table: { disable: true } },
  },
  decorators: [
    (Story) => (
      <div className="p-16">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** `content` accepts any node and takes precedence over `title`. */
export const WithRichContent: Story = {
  args: {
    content: (
      <div className="flex flex-col gap-1">
        <p className="font-medium text-ink-strong">Credit utilisation</p>
        <p className="text-ink-muted">
          Drawn balance divided by the approved limit, refreshed hourly.
        </p>
      </div>
    ),
    children: (
      <span className="inline-flex cursor-help items-center gap-1 text-ink-muted text-sm">
        Utilisation <Info size={14} />
      </span>
    ),
  },
};

/** Opens the moment the pointer lands. */
export const NoDelay: Story = { args: { delay: 0 } };

/** A long `delay` keeps the tip out of the way during quick passes. */
export const LongDelay: Story = { args: { delay: 800 } };

/** Nothing renders while `disabled` — the bubble is skipped entirely. */
export const Disabled: Story = { args: { disabled: true } };

/**
 * Disabled buttons swallow pointer events, so the tooltip wraps them in a
 * focusable `<span>` instead of cloning handlers onto the child.
 */
export const DisabledButtonChild: Story = {
  args: {
    title: "Raise your limit to enable this.",
    children: (
      <button type="button" className="btn btn-primary btn-md" disabled>
        Draw funds
      </button>
    ),
  },
};

/** `interactive` keeps the bubble open while the pointer is inside it. */
export const Interactive: Story = {
  args: {
    interactive: true,
    content: (
      <span>
        See the <Link href="#">credit policy</Link> for details.
      </span>
    ),
  },
};

/**
 * The bubble measures itself against `anchorRef.current`, which is still null
 * on the first render — so a tooltip that starts open needs one more render
 * before it can position itself. This wrapper supplies it.
 */
const OpenAfterMount = ({
  children,
  ...args
}: Omit<TooltipProps, "open" | "trigger">) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Tooltip {...args} trigger="manual" open={mounted}>
      {children}
    </Tooltip>
  );
};

/** Held open from mount, without waiting for a hover. */
export const DefaultOpen: Story = {
  render: ({ children, ...args }) => (
    <OpenAfterMount {...args}>{children}</OpenAfterMount>
  ),
};

const ManualTooltip = (args: TooltipProps) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <Tooltip
        {...args}
        trigger="manual"
        open={open}
        onOpenChange={args.onOpenChange}
      >
        <span className="text-ink-body text-sm">Anchor element</span>
      </Tooltip>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? "Hide" : "Show"} tooltip
      </button>
    </div>
  );
};

/** With `trigger: "manual"` hover is ignored and `open` drives everything. */
export const ManualTrigger: Story = {
  render: (args) => <ManualTooltip {...args} />,
};

/** All nine placements, held open so the geometry is visible at a glance. */
export const Placements: Story = {
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div className="grid grid-cols-3 gap-x-32 gap-y-24 p-32">
      {PLACEMENTS.map((placement) => (
        <OpenAfterMount
          key={placement}
          {...args}
          title={placement}
          placement={placement}
        >
          <span className="btn btn-outline btn-sm">{placement}</span>
        </OpenAfterMount>
      ))}
    </div>
  ),
};
