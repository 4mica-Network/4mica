import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import projects, { alias } from "./vitest.workspace";

export default defineConfig({
  plugins: [react()],
  // Also set at the root so a plain `vitest --project` or an editor
  // integration resolves imports the same way the projects do.
  resolve: { alias },
  test: {
    projects,
    coverage: {
      provider: "v8",
      exclude: [
        "**/.next/**",
        "**/node_modules/**",
        "src/app/**/layout.tsx",
        "src/types/**",
        "*.config.ts",
      ],
    },
  },
});
