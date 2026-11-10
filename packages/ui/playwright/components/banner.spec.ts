import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-banner";

test("labels the region with its title and shows the actions", async ({
  page,
}) => {
  await openStory(page, `${STORY}--default`);
  const region = page.getByRole("region", { name: "Instant payouts" });

  await expect(region).toBeVisible();
  await expect(
    region.getByText("Settle to your wallet the moment a payment clears."),
  ).toBeVisible();
  await expect(
    region.getByRole("link", { name: "Learn more" }),
  ).toHaveAttribute("href", "https://4mica.io");
  await expect(region.getByRole("button", { name: "Dismiss" })).toBeVisible();
});

test("dismisses and can be brought back by the owner", async ({ page }) => {
  await openStory(page, `${STORY}--controlled-dismissal`);
  const region = page.getByRole("region", { name: "Instant payouts" });

  await expect(region).toBeVisible();
  await region.getByRole("button", { name: "Dismiss" }).click();

  await expect(region).toHaveCount(0);
  const restore = page.getByRole("button", { name: "Bring it back" });
  await expect(restore).toBeVisible();

  await restore.click();

  await expect(region).toBeVisible();
  await expect(restore).toHaveCount(0);
});

test("hides the dismiss button when there is no handler", async ({ page }) => {
  await openStory(page, `${STORY}--without-dismiss`);

  await expect(page.getByRole("region")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
});

test("omits the learn-more link when the banner has no url", async ({
  page,
}) => {
  await openStory(page, `${STORY}--without-link`);

  await expect(page.getByRole("region")).toBeVisible();
  await expect(page.getByRole("link")).toHaveCount(0);
});

test("falls back to a generic label without a title", async ({ page }) => {
  await openStory(page, `${STORY}--message-only`);

  await expect(
    page.getByRole("region", { name: "Announcement" }),
  ).toBeVisible();
  await expect(page.getByTestId("banner-title")).toHaveCount(0);
});

test("uses custom action labels", async ({ page }) => {
  await openStory(page, `${STORY}--default`, {
    dismissLabel: "Close",
    learnMoreLabel: "Read the docs",
  });

  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the docs" })).toBeVisible();
});

test("renders nothing without banner data", async ({ page }) => {
  const root = await openStory(page, `${STORY}--no-banner`);

  await expect(page.getByTestId("banner")).toHaveCount(0);
  await expect(root.getByRole("region")).toHaveCount(0);
});

test("shows the media with its alt text", async ({ page }) => {
  await openStory(page, `${STORY}--with-thumbnail-only`);

  await expect(
    page.getByRole("region").getByRole("img", { name: "Instant payouts" }),
  ).toBeVisible();
});
