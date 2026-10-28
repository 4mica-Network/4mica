import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-avatar";

test("shows the initials of a two-word name", async ({ page }) => {
  const root = await openStory(page, `${STORY}--initials`);

  await expect(root.locator("span[aria-hidden='true']")).toHaveText("AL");
  await expect(root.locator("img")).toHaveCount(0);
});

test("shows the first two letters of a single-word name", async ({ page }) => {
  const root = await openStory(page, `${STORY}--initials`, { name: "Plato" });

  await expect(root.locator("span[aria-hidden='true']")).toHaveText("PL");
});

test("renders an image named after the person when src is set", async ({
  page,
}) => {
  const root = await openStory(page, `${STORY}--image`);
  const image = root.getByRole("img", { name: "Ada Lovelace" });

  await expect(image).toHaveAttribute(
    "src",
    "https://avatars.githubusercontent.com/u/9919?s=96",
  );
  await expect(image).toHaveAttribute("loading", "lazy");
  await expect(root.locator("span[aria-hidden='true']")).toHaveCount(0);
});

test("prefers an explicit alt text over the name", async ({ page }) => {
  const root = await openStory(page, `${STORY}--image`, {
    alt: "Portrait of Ada",
  });

  await expect(
    root.getByRole("img", { name: "Portrait of Ada" }),
  ).toBeVisible();
});

test("grows through each size step", async ({ page }) => {
  const root = await openStory(page, `${STORY}--sizes`);
  const avatars = root.locator("span[aria-hidden='true']");

  await expect(avatars).toHaveCount(5);

  const widths = await avatars.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().width),
  );

  expect(widths).toEqual([32, 36, 48, 64, 96]);
});
