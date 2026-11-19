import type { Preview } from "@storybook/react";
import { themes } from "@storybook/theming";
import { domAnimation, LazyMotion } from "framer-motion";

import "./tailwind.css";

document.documentElement.classList.add("dark");

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
  decorators: [
    (Story) => (
      <LazyMotion features={domAnimation} strict>
        <div className="dark flex min-h-40 flex-wrap items-center justify-center gap-4 bg-surface-deep p-10 text-ink-body">
          <Story />
        </div>
      </LazyMotion>
    ),
  ],
};

export default preview;
