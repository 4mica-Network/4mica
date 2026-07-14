import { create } from "@storybook/theming/create";
import logoUrl from "./public/logo.svg";

// Aligned to the app's dark palette (see @4mica/tailwind-config styles.css).
export default create({
  base: "dark",
  colorPrimary: "#7BCBFF", // --brand (dark)
  colorSecondary: "#48C9B0", // --brand-teal (dark)

  // UI
  appBg: "#0a0a0a", // --surface
  appContentBg: "#101010", // --surface-solid
  appPreviewBg: "#000000", // --surface-deep
  appBorderColor: "rgba(255,255,255,0.08)", // --overlay / 0.08
  appBorderRadius: 8,
  fontCode: "ui-monospace, SFMono-Regular, Menlo, monospace",

  // Text colors
  textColor: "#D8D8D8", // --ink
  textInverseColor: "#0a0a0a",
  textMutedColor: "#A1A1A1", // --ink-body

  // Toolbar
  barTextColor: "#A1A1A1",
  barSelectedColor: "#7BCBFF",
  barBg: "#0a0a0a",

  // Form colors
  inputBg: "#101010",
  inputBorder: "rgba(255,255,255,0.12)",
  inputTextColor: "#D8D8D8",
  inputBorderRadius: 8,

  brandTitle: "4Mica UI",
  brandImage: logoUrl,
});
