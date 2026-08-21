import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AutoStackHeight } from "../components/stack/AutoStackHeight";

interface Item {
  id: string;
  label: string;
  body?: string;
}

const items = (count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    label: `Card ${i + 1}`,
  }));

const renderItem = (item: Item) => (
  <div className="rounded-lg border border-overlay/10 bg-surface-solid px-4 py-5 shadow-sm">
    <div className="font-medium text-ink-strong text-sm">{item.label}</div>
    {item.body && <p className="mt-1 text-ink-muted text-xs">{item.body}</p>}
  </div>
);

const meta = {
  title: "Components/AutoStackHeight",
  component: AutoStackHeight,
  parameters: { layout: "centered" },
  args: { items: items(5), renderItem },
  argTypes: {
    direction: { control: "inline-radio", options: ["top", "bottom"] },
    growth: { control: "inline-radio", options: ["down", "up"] },
    offsetPerItem: { control: { type: "range", min: 0, max: 32, step: 2 } },
    items: { table: { disable: true } },
    renderItem: { table: { disable: true } },
  },
} satisfies Meta<typeof AutoStackHeight<Item>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleItem: Story = {
  args: { items: items(1) },
};

export const EmptyList: Story = {
  args: { items: [] },
};

const Resizing = () => {
  const [long, setLong] = useState(false);

  return (
    <div className="flex flex-col items-start gap-4">
      <button
        type="button"
        className="text-ink-muted text-xs underline"
        onClick={() => setLong((v) => !v)}
      >
        Toggle card length
      </button>
      <AutoStackHeight
        items={[
          {
            id: "a",
            label: "Card 1",
            body: long
              ? "Settlement runs nightly and payouts land the next business day, so your balance reflects cleared funds rather than pending ones. This copy is deliberately long enough to wrap onto several lines."
              : "Short.",
          },
          { id: "b", label: "Card 2" },
          { id: "c", label: "Card 3" },
        ]}
        renderItem={renderItem}
      />
    </div>
  );
};

export const ResizingContent: Story = {
  render: () => <Resizing />,
};

export const CustomWidth: Story = {
  args: { width: 320 },
};

export const GrowthUp: Story = {
  args: { growth: "up" },
};

export const TestIds: Story = {
  args: { "data-testid": "promo" },
};
