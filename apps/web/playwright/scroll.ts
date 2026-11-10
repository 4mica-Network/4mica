import type { Page } from "@playwright/test";

export const scrollThrough = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight / 2, 200);
    const total = document.documentElement.scrollHeight;

    for (let y = 0; y <= total; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    window.scrollTo(0, 0);
  });
};
