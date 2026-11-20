import { fileURLToPath } from "node:url";

/** `src/core` and `dist/core` are both two levels below the package root. */
export const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
