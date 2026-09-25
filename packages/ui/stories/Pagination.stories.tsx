import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Pagination } from "../components/pagination";

const meta = {
  title: "Components/Pagination",
  component: Pagination,
  parameters: { layout: "centered" },
  args: {
    page: 1,
    perPage: 20,
    total: 43,
    onPrev: () => {},
    onNext: () => {},
  },
  argTypes: {
    page: { control: { type: "number", min: 1 } },
    perPage: { control: { type: "number", min: 1 } },
    total: { control: { type: "number", min: 0 } },
  },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FirstPage: Story = { args: { page: 1, perPage: 20, total: 43 } };

export const LastPage: Story = { args: { page: 3, perPage: 20, total: 43 } };

export const Empty: Story = { args: { page: 1, perPage: 20, total: 0 } };

export const SinglePage: Story = { args: { page: 1, perPage: 20, total: 7 } };

export const Interactive: Story = {
  render: (args) => {
    const [page, setPage] = useState(1);
    return (
      <Pagination
        {...args}
        page={page}
        onPrev={() => setPage((current) => Math.max(current - 1, 1))}
        onNext={() => setPage((current) => current + 1)}
      />
    );
  },
};
