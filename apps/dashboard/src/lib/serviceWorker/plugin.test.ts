import { describe, expect, it } from "vitest";
import { serviceWorkerConfig, shellFiles } from "./plugin";

const HTML = `<!doctype html>
<html>
  <head>
    <link rel="icon" href="/favicon-48.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta property="og:image" content="https://app.4mica.io/og-image.jpg" />
    <script src="/theme-init.js"></script>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-react-def.js">
    <link rel="stylesheet" crossorigin href="/assets/index-ghi.css">
    <link rel="preconnect" href="//fonts.example.com">
  </head>
</html>`;

describe("service worker build", () => {
  it("caches the entry document and every same-origin file it references", () => {
    expect(shellFiles(HTML)).toEqual([
      "/index.html",
      "/favicon-48.png",
      "/manifest.webmanifest",
      "/theme-init.js",
      "/assets/index-abc.js",
      "/assets/vendor-react-def.js",
      "/assets/index-ghi.css",
    ]);
  });

  it("names a new shell cache whenever the entry document changes", () => {
    const first = serviceWorkerConfig(HTML);
    const same = serviceWorkerConfig(HTML);
    const next = serviceWorkerConfig(HTML.replace("index-abc", "index-xyz"));

    expect(same.version).toBe(first.version);
    expect(next.version).not.toBe(first.version);
  });
});
