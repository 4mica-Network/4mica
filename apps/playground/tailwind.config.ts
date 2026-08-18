import { createTailwindConfig } from "@4mica/tailwind-config";

export default createTailwindConfig({
  content: [
    "./src/**/*.{html,js,ts,jsx,tsx}",
    // Generate the utility classes used by the shared component library.
    "../../packages/ui/components/**/*.{ts,tsx}",
  ],
});
