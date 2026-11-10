import { expect, test } from "../fixtures";
import { openStory } from "../story";

const STORY = "components-videoplayer";

test("shows only the poster without a video url", async ({ page }) => {
  await openStory(page, `${STORY}--default`);
  const player = page.getByTestId("video-player");

  await expect(player).toHaveAttribute("data-playable", "false");
  await expect(page.getByTestId("video-player-thumbnail")).toHaveAttribute(
    "alt",
    "Product walkthrough",
  );
  await expect(player.getByRole("button")).toHaveCount(0);
  await expect(player.locator("video")).toHaveCount(0);
});

test("offers a labelled play button when playable", async ({ page }) => {
  await openStory(page, `${STORY}--playable`);
  const player = page.getByTestId("video-player");
  const play = player.getByRole("button", {
    name: "Play video: Product walkthrough",
  });

  await expect(player).toHaveAttribute("data-playable", "true");
  await expect(play).toBeVisible();
  await expect(page.getByTestId("video-player-thumbnail")).toHaveAttribute(
    "alt",
    "",
  );
  await expect(page.getByTestId("video-player-play-icon")).toBeVisible();
});

test("swaps the poster for a native video on play", async ({ page }) => {
  await openStory(page, `${STORY}--playable`);
  const player = page.getByTestId("video-player");

  await player.getByRole("button").click();

  const video = page.getByTestId("video-player-video");
  await expect(player).toHaveAttribute("data-playing", "true");
  await expect(video).toBeAttached();
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).toHaveAttribute("playsinline", "");
  await expect(video).toHaveAttribute("src", /flower\.mp4$/);
  await expect(video).toHaveAttribute("poster", /^data:image\/svg\+xml/);
  await expect(player.getByRole("button")).toHaveCount(0);
  await expect(video.locator("track")).toHaveCount(0);
});

test("starts the video with the keyboard", async ({ page }) => {
  await openStory(page, `${STORY}--playable`);

  await page.getByRole("button", { name: /Play video/ }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("video-player-video")).toBeAttached();
});

test("adds a default captions track when captions are given", async ({
  page,
}) => {
  await openStory(page, `${STORY}--with-captions`);

  await page.getByRole("button", { name: /Play video/ }).click();
  const track = page.getByTestId("video-player-video").locator("track");

  await expect(track).toHaveCount(1);
  await expect(track).toHaveAttribute("kind", "captions");
  await expect(track).toHaveAttribute("srclang", "en");
  await expect(track).toHaveAttribute("label", "English");
  await expect(track).toHaveAttribute("default", "");
});

test("renders a static poster when playback is disabled", async ({ page }) => {
  await openStory(page, `${STORY}--playback-disabled`);
  const player = page.getByTestId("video-player");

  await expect(player).toHaveAttribute("data-playable", "false");
  await expect(player.getByRole("button")).toHaveCount(0);

  await player.click();

  await expect(player.locator("video")).toHaveCount(0);
});

test("uses a custom thumbnail node instead of the image", async ({ page }) => {
  await openStory(page, `${STORY}--custom-thumbnail-node`);
  const play = page.getByRole("button", { name: /Play video/ });

  await expect(play.getByText("Custom thumbnail node")).toBeVisible();
  await expect(page.getByTestId("video-player-thumbnail")).toHaveCount(0);
});

test("keeps the frame at the requested aspect ratio", async ({ page }) => {
  await openStory(page, `${STORY}--ratios`);
  const frames = page.getByTestId("video-player");

  await expect(frames).toHaveCount(3);

  const ratios = await Promise.all(
    (await frames.all()).map(async (frame) => {
      const box = await frame.boundingBox();
      return Number(((box?.width ?? 0) / (box?.height ?? 1)).toFixed(2));
    }),
  );

  expect(ratios).toEqual([1.78, 1.33, 1]);
});
