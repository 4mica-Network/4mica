import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../components/button";
import type { Placement } from "../components/dropdown";
import {
  ConfirmPopup,
  PopupConfirm,
  type PopupConfirmProps,
} from "../components/popup-confirm";

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
  title: "Components/PopupConfirm",
  component: PopupConfirm,
  parameters: { layout: "centered" },
  args: {
    title: "Remove this customer?",
    description: "Their payments stay on your ledger.",
    confirmLabel: "Remove",
    cancelLabel: "Cancel",
    placement: "bottom",
    closeOnOutsideClick: true,
    onConfirm: fn(),
    onRequestClose: fn(),
    children: null,
  },
  argTypes: {
    placement: { control: "select", options: PLACEMENTS },
    closeOnOutsideClick: { control: "boolean" },
    children: { table: { disable: true } },
    confirmButtonProps: { table: { disable: true } },
    cancelButtonProps: { table: { disable: true } },
  },
} satisfies Meta<typeof PopupConfirm>;

export default meta;

type Story = StoryObj<typeof meta>;

const render = (args: PopupConfirmProps) => (
  <PopupConfirm {...args}>
    <Button intent="outline" size="sm">
      <span className="flex items-center gap-1.5 text-sm">
        <Trash2 className="h-4 w-4" />
        Remove customer
      </span>
    </Button>
  </PopupConfirm>
);

export const Default: Story = { render };

export const Destructive: Story = {
  args: {
    confirmButtonProps: {
      className: "bg-danger text-surface-deep hover:bg-danger",
    },
  },
  render,
};

export const TitleOnly: Story = {
  args: { description: undefined, title: "Remove this customer?" },
  render,
};

export const StaysOpenOnOutsideClick: Story = {
  args: { closeOnOutsideClick: false },
  render,
};

export const Placements: Story = {
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div className="grid min-h-screen place-items-center p-24">
      <div className="grid grid-cols-4 gap-6">
        {PLACEMENTS.map((placement) => (
          <PopupConfirm key={placement} {...args} placement={placement}>
            <Button intent="outline" size="sm">
              {placement}
            </Button>
          </PopupConfirm>
        ))}
      </div>
    </div>
  ),
};

export const Controlled: Story = {
  render: (args) => {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <span ref={anchorRef} className="inline-flex">
          <Button
            intent="outline"
            size="sm"
            onClick={() => setIsOpen((open) => !open)}
          >
            Toggle from outside
          </Button>
        </span>

        <ConfirmPopup
          {...args}
          isOpen={isOpen}
          anchorRef={anchorRef}
          onConfirm={() => setIsOpen(false)}
          onCancel={() => setIsOpen(false)}
          onRequestClose={() => setIsOpen(false)}
        />
      </>
    );
  },
};
