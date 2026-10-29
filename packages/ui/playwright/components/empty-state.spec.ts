import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-emptystate";

test("renders only the title by default", async ({ page }) => {
  await openStory(page, `${STORY}--default`);

  await expect(page.getByTestId("empty-state-title")).toHaveText(
    "No API keys yet",
  );
  await expect(page.getByTestId("empty-state-description")).toHaveCount(0);
  await expect(page.getByTestId("empty-state-icon")).toHaveCount(0);
  await expect(page.getByTestId("empty-state-action")).toHaveCount(0);
});

test("takes its title from args", async ({ page }) => {
  await openStory(page, `${STORY}--default`, { title: "Nothing to show" });

  await expect(page.getByTestId("empty-state-title")).toHaveText(
    "Nothing to show",
  );
});

test("shows the description and icon when given", async ({ page }) => {
  await openStory(page, `${STORY}--with-icon`);

  await expect(page.getByTestId("empty-state-description")).toHaveText(
    "Create one to start calling the API.",
  );
  await expect(page.getByTestId("empty-state-icon").locator("svg")).toHaveCount(
    1,
  );
});

test("renders a callback action as an enabled button", async ({ page }) => {
  await openStory(page, `${STORY}--with-action`);

  const button = page.getByRole("button", { name: "Add endpoint" });
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute(
    "data-testid",
    "empty-state-action-button",
  );
  await button.click();
  await expect(button).toBeVisible();
});

test("renders a node action as given", async ({ page }) => {
  await openStory(page, `${STORY}--with-node-action`);

  const link = page.getByRole("link", { name: "Go to the dashboard" });
  await expect(link).toHaveAttribute("href", "https://4mica.io");
  await expect(page.getByTestId("empty-state-action-button")).toHaveCount(0);
});

test("renders every variant and size combination", async ({ page }) => {
  await openStory(page, `${STORY}--variants`);

  await expect(page.getByTestId("empty-state")).toHaveCount(6);
  for (const variant of ["card", "plain", "dashed"]) {
    for (const size of ["md", "sm"]) {
      await expect(
        page.getByText(`variant="${variant}" size="${size}"`),
      ).toBeVisible();
    }
  }
});

test("prefixes test ids with data-testid", async ({ page }) => {
  await openStory(page, `${STORY}--with-description`, {
    "data-testid": "keys",
  });

  await expect(page.getByTestId("keys-empty-state")).toBeVisible();
  await expect(page.getByTestId("keys-empty-state-description")).toBeVisible();
});
