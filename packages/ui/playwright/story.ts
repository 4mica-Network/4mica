import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

export const openStory = async (
  page: Page,
  id: string,
  args: Record<string, string | number | boolean> = {},
): Promise<Locator> => {
  const query = new URLSearchParams({ id, viewMode: "story" });
  const serialized = Object.entries(args)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(";");

  if (serialized) {
    query.set("args", serialized);
  }

  await page.goto(`/iframe.html?${query.toString()}`);
  await expect(page.locator("body")).toHaveClass(/sb-show-main/);

  return page.locator("#storybook-root");
};
