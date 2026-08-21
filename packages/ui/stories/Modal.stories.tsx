import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import { Button } from "../components/button";
import { Modal, type ModalProps } from "../components/modal";

const meta = {
  title: "Components/Modal",
  component: Modal,
  parameters: { layout: "centered" },
  args: {
    isOpen: true,
    title: "Connect a payout account",
    description: "We use this to settle your agent's earnings.",
    children: (
      <p className="text-ink-body text-sm">
        Payouts land within two business days of settlement. You can change the
        destination account at any time from Settings.
      </p>
    ),
    onClose: fn(),
  },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    showClose: { control: "boolean" },
    disableOverlayClose: { control: "boolean" },
    disableEscapeClose: { control: "boolean" },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The modal is controlled. This wrapper owns `isOpen` so the close button,
 * Escape and the overlay actually do something in the canvas.
 */
const ControlledModal = (args: ModalProps) => {
  const [isOpen, setIsOpen] = useState(args.isOpen);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open modal</Button>
      <Modal
        {...args}
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          args.onClose();
        }}
      />
    </>
  );
};

export const Default: Story = {};

export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };

export const WithoutDescription: Story = { args: { description: undefined } };

export const WithFooter: Story = {
  args: {
    footer: (
      <>
        <Button intent="ghost" size="sm">
          Cancel
        </Button>
        <Button intent="invert" size="sm">
          Continue
        </Button>
      </>
    ),
  },
};

/**
 * The onboarding recipe: no close button, and neither Escape nor an overlay
 * click dismisses it. The only way out is a control the content provides.
 */
export const Blocking: Story = {
  args: {
    title: "Finish setting up your account",
    showClose: false,
    disableOverlayClose: true,
    disableEscapeClose: true,
    footer: (
      <Button intent="invert" size="sm">
        Continue
      </Button>
    ),
  },
};

/** The body scrolls on its own; the header and footer stay put. */
export const LongContent: Story = {
  args: {
    children: (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 24 }, (_, index) => `paragraph-${index + 1}`).map(
          (key, index) => (
            <p key={key} className="text-ink-body text-sm">
              Paragraph {index + 1} — the panel is capped at the viewport height
              and the body is the only part that scrolls.
            </p>
          ),
        )}
      </div>
    ),
    footer: (
      <Button intent="invert" size="sm">
        Done
      </Button>
    ),
  },
};

/** Click to open, then try Escape, the overlay and Tab-cycling. */
export const Interactive: Story = {
  args: { isOpen: false },
  render: (args) => <ControlledModal {...args} />,
};
