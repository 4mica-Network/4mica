import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { Switch } from "../components/switch";

const meta = {
  title: "Components/Switch",
  component: Switch,
  parameters: { layout: "centered" },
  args: { onToggle: fn() },
  argTypes: {
    initialState: { control: "boolean" },
    disabled: { control: "boolean" },
    colors: { control: "object" },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** State is internal — `initialState` only seeds it. */
export const Off: Story = { args: { initialState: false } };
export const On: Story = { args: { initialState: true } };

export const Disabled: Story = { args: { disabled: true } };
export const DisabledOn: Story = {
  args: { initialState: true, disabled: true },
};

/** `colors` accepts any CSS colour; defaults are theme tokens. */
export const CustomColors: Story = {
  args: {
    initialState: true,
    colors: {
      backgroundOn: "#48C9B0",
      backgroundOff: "rgba(255,255,255,0.15)",
      circleOn: "#0a0a0a",
      circleOff: "#0a0a0a",
    },
  },
};

export const WithLabel: Story = {
  args: { initialState: true },
  render: (args) => (
    <div className="flex items-center gap-3">
      <Switch {...args} aria-label="Enable auto-settlement" />
      <span className="text-ink-body text-sm">Enable auto-settlement</span>
    </div>
  ),
};

const SETTINGS = [
  { id: "auto-settle", label: "Auto-settle invoices", on: true },
  { id: "alerts", label: "Credit-limit alerts", on: true },
  { id: "sandbox", label: "Sandbox mode", on: false },
];

export const Group: Story = {
  args: {},
  render: (args) => (
    <div className="flex w-72 flex-col gap-1">
      {SETTINGS.map((setting) => (
        <div
          key={setting.id}
          className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-overlay/5"
        >
          <span className="text-ink-body text-sm">{setting.label}</span>
          <Switch
            {...args}
            aria-label={setting.label}
            initialState={setting.on}
          />
        </div>
      ))}
    </div>
  ),
};
