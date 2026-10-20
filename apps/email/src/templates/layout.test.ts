import { templateIds } from "@4mica/email-client";
import { registry } from "@templates/registry";
import { render } from "react-email";
import { beforeAll, describe, expect, it } from "vitest";

const SAMPLE_ID = templateIds[0];

const renderSample = () => {
  const definition = registry[SAMPLE_ID];
  const previewProps = (
    definition.component as unknown as { PreviewProps: Record<string, unknown> }
  ).PreviewProps;

  return render(definition.component(previewProps as never));
};

describe("shared email layout", () => {
  let html: string;

  beforeAll(async () => {
    html = await renderSample();
  });

  // The logo used to be built from `links.website`, which follows
  // NEXT_PUBLIC_BASE_URL — a localhost base shipped a broken image to every
  // recipient. It must stay pinned to the production origin.
  it("points the logo at an absolute production URL", () => {
    expect(html).toContain(
      'src="https://4mica.io/assets/logo_transparent.png"',
    );
    expect(html).not.toMatch(/src="https?:\/\/localhost/);
  });

  it("gives the logo both dimensions so Outlook cannot mis-size it", () => {
    expect(html).toMatch(/<img[^>]*logo_transparent\.png[^>]*>/);
    expect(html).toContain('height="28"');
    expect(html).toContain('width="39"');
  });

  it("ships the mobile full-height stylesheet", () => {
    expect(html).toContain("@media only screen and (max-width: 600px)");
    expect(html).toContain('name="viewport"');
  });

  it("tags the card so the breakpoint can target it", () => {
    expect(html).toContain('class="mica-card"');
  });
});
