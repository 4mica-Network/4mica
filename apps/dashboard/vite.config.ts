import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { requireTrustedApiUrl } from "./src/api/apiUrl";
import { serviceWorkerPlugin } from "./src/lib/serviceWorker/plugin";
import { socialImageUrl } from "./src/lib/socialImage";

const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

const vendor = (packages: string) =>
  new RegExp(`[\\\\/]node_modules[\\\\/](${packages})[\\\\/]`);

const VENDOR_CHUNKS = [
  {
    name: "vendor-react",
    test: vendor("react|react-dom|scheduler"),
    priority: 30,
  },
  {
    name: "vendor-router",
    test: vendor("react-router|react-router-dom"),
    priority: 20,
  },
  {
    name: "vendor-i18n",
    test: vendor("i18next|react-i18next"),
    priority: 20,
  },
  {
    name: "vendor-redux",
    test: vendor("redux|react-redux|redux-saga|@redux-saga/[^\\\\/]+"),
    priority: 20,
  },
  {
    name: "vendor-clerk",
    test: vendor("@clerk/[^\\\\/]+|swr|dequal"),
    priority: 20,
  },
];

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build" && mode === "production") {
    requireTrustedApiUrl(env.VITE_API_URL);
  }
  const socialImage = socialImageUrl(env.VITE_APP_URL);

  return {
    plugins: [
      react(),
      tailwindcss(),
      serviceWorkerPlugin(),
      {
        name: "social-image",
        transformIndexHtml: () =>
          socialImage
            ? [
                {
                  tag: "meta",
                  attrs: { property: "og:image", content: socialImage },
                  injectTo: "head",
                },
                {
                  tag: "meta",
                  attrs: { property: "og:image:alt", content: "4Mica logo" },
                  injectTo: "head",
                },
              ]
            : [],
      },
    ],
    build: {
      sourcemap: false,
      rolldownOptions: {
        output: {
          minify: { compress: { dropConsole: true, dropDebugger: true } },
          codeSplitting: { groups: VENDOR_CHUNKS },
        },
      },
    },
    resolve: {
      alias: {
        "@4mica/url": fileURLToPath(
          new URL("../../packages/url/src/index.ts", import.meta.url),
        ),
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@api": fileURLToPath(new URL("./src/api", import.meta.url)),
        "@stores": fileURLToPath(new URL("./src/stores", import.meta.url)),
        "@utils": fileURLToPath(new URL("./src/utils", import.meta.url)),
        "@i18n": fileURLToPath(new URL("./src/i18n", import.meta.url)),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: { port: 4173, strictPort: false },
    preview: { port: 4173 },
  };
});
