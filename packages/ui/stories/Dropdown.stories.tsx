import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { CreditCard, LogOut, Settings, User } from "lucide-react";
import { createRef, useRef, useState } from "react";
import {
  Dropdown,
  type DropdownProps,
  type Placement,
} from "../components/dropdown";

const PLACEMENTS: Placement[] = [
  "top",
  "topLeft",
  "topRight",
  "bottom",
  "bottomLeft",
  "bottomRight",
  "left",
  "right",
];

const meta = {
  title: "Components/Dropdown",
  component: Dropdown,
  parameters: { layout: "centered" },
  args: {
    isOpen: true,
    anchorRef: createRef<HTMLElement>(),
    children: null,
    onClickOutside: fn(),
  },
  argTypes: {
    placement: { control: "select", options: PLACEMENTS },
    placementOffsetX: { control: { type: "number" } },
    placementOffsetY: { control: { type: "number" } },
    matchAnchorWidth: { control: "boolean" },
    flipOnOverflow: { control: "boolean" },
    isOpen: { table: { disable: true } },
    anchorRef: { table: { disable: true } },
    children: { table: { disable: true } },
  },
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const MENU = (
  <div className="flex w-48 flex-col p-1 text-sm">
    <button
      type="button"
      className="rounded-md px-3 py-2 text-left hover:bg-overlay/10"
    >
      Profile
    </button>
    <button
      type="button"
      className="rounded-md px-3 py-2 text-left hover:bg-overlay/10"
    >
      Billing
    </button>
    <button
      type="button"
      className="rounded-md px-3 py-2 text-left hover:bg-overlay/10"
    >
      Settings
    </button>
  </div>
);

/**
 * Dropdown positions itself against an anchor element and portals into
 * `document.body`, so every story needs a real anchor and an open state.
 */
const DropdownDemo = ({
  children,
  ...args
}: Omit<DropdownProps, "anchorRef">) => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(args.isOpen);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="btn btn-primary btn-md"
        onClick={() => setOpen((prev) => !prev)}
      >
        Toggle dropdown
      </button>
      <Dropdown
        {...args}
        isOpen={open}
        anchorRef={anchorRef}
        onClickOutside={() => {
          setOpen(false);
          args.onClickOutside?.();
        }}
      >
        {children}
      </Dropdown>
    </>
  );
};

export const Default: Story = {
  render: (args) => <DropdownDemo {...args}>{MENU}</DropdownDemo>,
};

/** Panel takes the anchor's width — how Select and ComboBox use it. */
export const MatchAnchorWidth: Story = {
  args: { matchAnchorWidth: true },
  render: (args) => (
    <DropdownDemo {...args}>
      <div className="p-3 text-sm">Same width as the trigger.</div>
    </DropdownDemo>
  ),
};

/** `placementOffsetX` / `placementOffsetY` nudge the panel off the anchor. */
export const WithOffset: Story = {
  args: { placement: "bottomLeft", placementOffsetX: 24, placementOffsetY: 24 },
  render: (args) => <DropdownDemo {...args}>{MENU}</DropdownDemo>,
};

/**
 * By default the panel flips to the opposite side when it would overflow the
 * viewport. Turn it off to pin the placement you asked for.
 */
export const NoFlipOnOverflow: Story = {
  args: { placement: "top", flipOnOverflow: false },
  render: (args) => <DropdownDemo {...args}>{MENU}</DropdownDemo>,
};

export const RichContent: Story = {
  render: (args) => (
    <DropdownDemo {...args}>
      <div className="w-56 p-1 text-sm">
        <div className="border-overlay/10 border-b px-3 py-2">
          <p className="font-medium text-ink-strong">Acme Robotics</p>
          <p className="text-ink-subtle text-xs">ops@acme.com</p>
        </div>
        <div className="flex flex-col py-1">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-overlay/10"
          >
            <User size={14} /> Profile
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-overlay/10"
          >
            <CreditCard size={14} /> Billing
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-overlay/10"
          >
            <Settings size={14} /> Settings
          </button>
        </div>
        <div className="border-overlay/10 border-t py-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-danger hover:bg-overlay/10"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </DropdownDemo>
  ),
};

/** Nothing is rendered while closed — click the trigger to open it. */
export const ClosedState: Story = {
  args: { isOpen: false },
  render: (args) => <DropdownDemo {...args}>{MENU}</DropdownDemo>,
};

const PlacementAnchor = ({ placement }: { placement: Placement }) => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex items-center justify-center">
      <button ref={anchorRef} type="button" className="btn btn-outline btn-sm">
        {placement}
      </button>
      <Dropdown
        isOpen
        anchorRef={anchorRef}
        placement={placement}
        flipOnOverflow={false}
      >
        <div className="whitespace-nowrap px-3 py-2 text-xs">{placement}</div>
      </Dropdown>
    </div>
  );
};

/** All eight placements, with flipping disabled so each one stays put. */
export const Placements: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="grid grid-cols-2 gap-x-40 gap-y-28 p-32">
      {PLACEMENTS.map((placement) => (
        <PlacementAnchor key={placement} placement={placement} />
      ))}
    </div>
  ),
};
