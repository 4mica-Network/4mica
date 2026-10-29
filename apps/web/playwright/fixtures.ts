import { test as base, expect } from "@playwright/test";

export const WEBKIT_MEDIA_CONTROLS = "^Button failed to load, iconName = ";

export const test = base.extend<{
  allowedConsoleErrors: RegExp;
  pageErrors: string[];
  consoleErrors: string[];
  failedResponses: string[];
}>({
  allowedConsoleErrors: [new RegExp(WEBKIT_MEDIA_CONTROLS), { option: true }],
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        const text = message.text();
        if (message.type() === "error" && !allowedConsoleErrors.test(text)) {
          errors.push(text);
        }
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
  failedResponses: [
    async ({ page, baseURL }, use) => {
      const failures: string[] = [];
      page.on("response", (response) => {
        const url = response.url();
        if (
          baseURL &&
          url.startsWith(baseURL) &&
          response.status() >= 400 &&
          response.request().resourceType() !== "document"
        ) {
          failures.push(`${response.status()} ${url}`);
        }
      });
      await use(failures);
      expect(failures).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
