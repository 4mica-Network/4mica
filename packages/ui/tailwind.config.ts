import { createTailwindConfig } from "@4mica/tailwind-config";

// Used by Storybook (via `@config` in .storybook/tailwind.css) so the shared
// design tokens — colors like `brand`/`ink`/`overlay` and the custom `text-md`
// font size — resolve when rendering components in isolation.
export default createTailwindConfig({
  content: ["./components/**/*.{ts,tsx}", "./stories/**/*.{ts,tsx}"],
});
