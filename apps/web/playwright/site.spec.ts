import { expect, test } from "./fixtures";
import { SITE_PATHS } from "./pages";

test.skip(
  ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
  "served files are browser independent",
);

test("robots.txt points at the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");

  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/Sitemap: .*sitemap\.xml/);
});

test("sitemap.xml is served and matches the exported pages", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");

  expect(response.status()).toBe(200);
  const locs = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(([, loc]) => new URL(loc).pathname)
    .sort();
  expect(locs).toEqual(SITE_PATHS);
});

test("every internal link on every page resolves", async ({
  page,
  request,
  baseURL,
}) => {
  const hrefs = new Set<string>();

  for (const route of SITE_PATHS) {
    await page.goto(route);
    const links = await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      );
    for (const href of links) {
      if (baseURL && href.startsWith(baseURL)) {
        hrefs.add(href.split("#")[0]);
      }
    }
  }

  expect(hrefs.size).toBeGreaterThan(0);

  const broken: string[] = [];
  for (const href of [...hrefs].sort()) {
    const response = await request.get(href, { maxRedirects: 0 });
    if (response.status() >= 400) {
      broken.push(`${response.status()} ${href}`);
    }
  }

  expect(broken).toEqual([]);
});

test("every page has Open Graph data with a reachable image", async ({
  page,
  request,
}) => {
  const broken: string[] = [];

  for (const route of SITE_PATHS) {
    await page.goto(route);
    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content");

    if (!ogTitle?.trim()) {
      broken.push(`${route}: missing og:title`);
    }

    if (!ogImage) {
      broken.push(`${route}: missing og:image`);
      continue;
    }

    const image = await request.get(new URL(ogImage).pathname);
    if (image.status() !== 200) {
      broken.push(`${route}: og:image ${image.status()} ${ogImage}`);
    }
  }

  expect(broken).toEqual([]);
});
