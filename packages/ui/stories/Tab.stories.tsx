import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { useState } from "react";
import { TabGroup } from "../components/tab/TabGroup";
import type { Tab as TabType } from "../components/tab/type";

const meta = {
  title: "Components/TabGroup",
  component: TabGroup,
  parameters: { layout: "centered" },
  args: { onTabChange: fn() },
  argTypes: {
    defaultActiveTab: {
      control: "text",
      description: "ID of the default active tab (uncontrolled)",
    },
    activeTab: { control: false },
    onTabChange: { action: "tabChanged" },
    renderContent: { control: false },
    wrapperClassName: { control: "text" },
  },
} satisfies Meta<typeof TabGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleTabs: TabType[] = [
  {
    id: "overview",
    label: "Overview",
    content: <p className="text-ink-body">This is the overview section.</p>,
  },
  {
    id: "details",
    label: "Details",
    content: <p className="text-ink-body">Here are the details.</p>,
  },
  {
    id: "settings",
    label: "Settings",
    content: <p className="text-ink-body">Adjust your preferences here.</p>,
  },
];

/**
 * Uncontrolled: the group owns the active id. Note that panels render only in
 * controlled mode, so this story shows the tab strip alone.
 */
export const Default: Story = {
  args: { tabs: sampleTabs, defaultActiveTab: "overview" },
};

/** A disabled tab is skipped by the initial selection and cannot be activated. */
export const WithDisabled: Story = {
  args: {
    tabs: [
      { id: "overview", label: "Overview" },
      { id: "billing", label: "Billing", disabled: true },
      { id: "settings", label: "Settings" },
    ],
  },
};

export const Centered: Story = {
  args: { tabs: sampleTabs, tabGroupPlacement: "center" },
};

/** Overflowing strips scroll, with edge fades and arrows appearing as needed. */
export const Scrollable: Story = {
  args: {
    tabs: Array.from({ length: 12 }, (_, i) => ({
      id: `tab-${i + 1}`,
      label: `Workspace ${i + 1}`,
    })),
    wrapperClassName: "w-80",
  },
};

/** Controlled: the parent owns the active id, and the panel renders. */
const ControlledExample = ({
  onTabChange,
}: {
  onTabChange?: (tabId: string) => void;
}) => {
  const [activeTab, setActiveTab] = useState("details");

  return (
    <TabGroup
      tabs={sampleTabs}
      activeTab={activeTab}
      onTabChange={(tabId) => {
        setActiveTab(tabId);
        onTabChange?.(tabId);
      }}
      contentClassName="pt-3"
    />
  );
};

export const Controlled: Story = {
  args: { tabs: sampleTabs },
  render: (args) => <ControlledExample onTabChange={args.onTabChange} />,
};
