import { createRequire } from "node:module";
import type { Page } from "@playwright/test";

const axeScript = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type AxeWindow = Window & {
  axe: {
    run: (
      context: Document,
      options: { runOnly: { type: "tag"; values: string[] } },
    ) => Promise<{
      violations: { id: string; nodes: { target: string[] }[] }[];
    }>;
  };
};

export const axeViolations = async (page: Page): Promise<string[]> => {
  await page.addScriptTag({ path: axeScript });
  return page.evaluate(async (tags) => {
    const { violations } = await (window as unknown as AxeWindow).axe.run(
      document,
      { runOnly: { type: "tag", values: tags } },
    );
    return violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    );
  }, WCAG_AA);
};

export const forceTheme = (page: Page, theme: "dark" | "light") =>
  page.route(/\/me$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, user: { ...body.user, appTheme: theme } },
    });
  });
