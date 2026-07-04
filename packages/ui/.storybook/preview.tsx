import type { Preview } from "@storybook/react";
import { themes } from "@storybook/theming";

import "./tailwind.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: { theme: themes.dark },
    backgrounds: { disable: true },
  },
  // The app defaults to the dark theme (`.dark` on <html>). Reproduce that
  // context so components render against real tokens.
  decorators: [
    (Story) => (
      <div className="dark flex min-h-40 flex-wrap items-center justify-center gap-4 bg-surface-deep p-10 text-ink-body">
        <Story />
      </div>
    ),
  ],
};

export default preview;
