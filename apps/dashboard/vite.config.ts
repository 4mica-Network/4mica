import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Rolldown-powered Vite. The 4mica CLI (`4mica dashboard`) opens this port.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 4173, strictPort: false },
  preview: { port: 4173 },
});
