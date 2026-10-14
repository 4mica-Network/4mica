import { createTailwindConfig } from "@4mica/tailwind-config";

export default createTailwindConfig({
  content: [
    "./{app,components}/**/*.{ts,tsx}",
    "../../packages/ui/components/**/*.{ts,tsx}",
  ],
});
