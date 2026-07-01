# @4mica/tailwind-config

Shared Tailwind configuration and 4Mica design-system styles.

## Usage

Install the package in an app workspace, then keep app-specific content globs local:

```js
import { createTailwindConfig } from "@4mica/tailwind-config";

export default createTailwindConfig({
  content: ["./{app,components,lib,pages,hooks}/**/*.{html,js,ts,jsx,tsx}"],
});
```

Import the shared CSS once from the app global stylesheet:

```css
@import url("https://cdnjs.cloudflare.com/ajax/libs/remixicon/4.5.0/remixicon.min.css");
@import "tailwindcss";
@import "@4mica/tailwind-config/styles.css";
@config "../tailwind.config.ts";
```

The package also exports `preset`, `colors`, `semanticHslColors`, `fourMicaRgbColors`, `borderRadius`, and `fontSize` for consumers that need direct token access.
