import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import { borderRadius, colors, fontSize } from "./tokens";

export const preset = {
  theme: {
    extend: {
      borderRadius,
      colors,
      fontSize,
    },
  },
  plugins: [animate],
} satisfies Config;

export default preset;
