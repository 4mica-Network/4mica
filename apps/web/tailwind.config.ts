import { createTailwindConfig } from "@4mica/tailwind-config";

export default createTailwindConfig({
  content: ["./{app,components,lib,pages,hooks}/**/*.{html,js,ts,jsx,tsx}"],
});
