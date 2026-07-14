import { createTailwindConfig } from "@4mica/tailwind-config";

export default createTailwindConfig({
  content: [
    "./{app,components,lib,pages,hooks}/**/*.{html,js,ts,jsx,tsx}",
    // Generate utility classes used by the shared component library.
    "../../packages/ui/components/**/*.{ts,tsx}",
  ],
});
