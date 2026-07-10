import { createTailwindConfig } from "@4mica/tailwind-config";

export default createTailwindConfig({
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/components/**/*.{ts,tsx}",
  ],
});
