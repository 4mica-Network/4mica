import type { Config } from "tailwindcss";
import { preset } from "./preset";

type SharedTailwindConfig = Omit<Config, "darkMode" | "presets"> & {
  darkMode?: Config["darkMode"];
  presets?: NonNullable<Config["presets"]>;
};

export function createTailwindConfig({
  presets = [],
  darkMode = "class",
  ...rest
}: SharedTailwindConfig = {}): Config {
  return {
    darkMode,
    presets: [preset, ...presets],
    ...rest,
  };
}

export {
  borderRadius,
  colors,
  fontSize,
  fourMicaRgbColors,
  semanticHslColors,
} from "./tokens";
export { preset };
