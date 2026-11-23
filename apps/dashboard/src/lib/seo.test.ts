import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOCIAL_IMAGE_PATH, socialImageUrl } from "./socialImage";

const html = readFileSync("index.html", "utf8");
const nginx = readFileSync("nginx.conf", "utf8");

const pngSize = (path: string) => {
  const bytes = readFileSync(path);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
};

describe("search engines", () => {
  it("asks every crawler not to index or follow the private app", () => {
    expect(html).toContain(
      '<meta name="robots" content="noindex, nofollow" />',
    );
  });

  it("lets crawlers fetch pages so they can see the noindex", () => {
    const robots = readFileSync("public/robots.txt", "utf8");

    expect(robots).toBe("User-agent: *\nAllow: /\n");
    expect(robots).not.toMatch(/sitemap/i);
  });

  it("answers missing files with a real 404 instead of the app shell", () => {
    expect(nginx).toMatch(
      /location ~ \\\.\[A-Za-z0-9\]\+\$ \{[^}]*try_files \$uri =404;/,
    );
  });
});

describe("link previews", () => {
  it("describes the app for unfurlers that do not run JavaScript", () => {
    for (const tag of [
      'property="og:type" content="website"',
      'property="og:site_name" content="4Mica"',
      'property="og:title" content="4Mica Dashboard"',
      'name="twitter:card" content="summary"',
    ]) {
      expect(html).toContain(tag);
    }
    expect(html).toMatch(/name="description"\s+content="[^"]+"/);
    expect(html).toMatch(/property="og:description"\s+content="[^"]+"/);
  });

  it("points the preview image at the app's own origin", () => {
    expect(socialImageUrl("https://app.4mica.io")).toBe(
      `https://app.4mica.io${SOCIAL_IMAGE_PATH}`,
    );
    expect(socialImageUrl(" https://app.4mica.io/settings/ ")).toBe(
      `https://app.4mica.io${SOCIAL_IMAGE_PATH}`,
    );
  });

  it("leaves the image out rather than emit a broken URL", () => {
    expect(socialImageUrl(undefined)).toBeNull();
    expect(socialImageUrl("")).toBeNull();
    expect(socialImageUrl("not a url")).toBeNull();
    expect(socialImageUrl("javascript:alert(1)")).toBeNull();
  });

  it("ships the preview image", () => {
    expect(readFileSync(`public${SOCIAL_IMAGE_PATH}`).byteLength).toBeLessThan(
      100_000,
    );
  });
});

describe("icons", () => {
  it("links a square favicon, a touch icon and a manifest", () => {
    expect(html).toContain(
      '<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />',
    );
    expect(html).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    );
    expect(html).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(pngSize("public/favicon-48.png")).toBe("48x48");
    expect(pngSize("public/apple-touch-icon.png")).toBe("180x180");
  });

  it("lists manifest icons that exist at their declared sizes", () => {
    const manifest = JSON.parse(
      readFileSync("public/manifest.webmanifest", "utf8"),
    ) as { name: string; icons: { src: string; sizes: string }[] };

    expect(manifest.name).toBe("4Mica Dashboard");
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual([
      "192x192",
      "512x512",
    ]);
    for (const icon of manifest.icons) {
      expect(pngSize(`public${icon.src}`)).toBe(icon.sizes);
    }
  });

  it("serves the manifest with its own media type", () => {
    expect(nginx).toMatch(
      /location = \/manifest\.webmanifest \{\n(?: {4}.*\n)*? {4}default_type application\/manifest\+json;/,
    );
  });
});
