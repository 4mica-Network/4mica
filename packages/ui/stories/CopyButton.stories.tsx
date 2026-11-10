import type { Meta, StoryObj } from "@storybook/react";
import { CopyButton } from "../components/copy-button";

const meta = {
  title: "Components/CopyButton",
  component: CopyButton,
  parameters: { layout: "centered" },
  args: { value: "sk_live_4mica_example" },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const IconOnly: Story = { args: { hideLabel: true } };

export const OnCodeSurface: Story = {
  render: (args) => (
    <div className="flex items-center gap-3 rounded-md bg-black px-3 py-2 font-mono text-white/80 text-xs">
      {args.value}
      <CopyButton
        {...args}
        className="text-white/50 hover:bg-white/10 hover:text-white/90 data-[copied]:text-white"
      />
    </div>
  ),
};
