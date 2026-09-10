import { ONBOARDING_STEP_IDS } from "@4mica/email-client";
import { registry } from "@templates/registry";
import { render } from "react-email";
import { describe, expect, it } from "vitest";

const previewPropsFor = (id: (typeof ONBOARDING_STEP_IDS)[number]) =>
  (
    registry[id].component as unknown as {
      PreviewProps: Record<string, unknown>;
    }
  ).PreviewProps;

describe("onboarding drip templates", () => {
  it("registers every step in the sequence", () => {
    for (const id of ONBOARDING_STEP_IDS) {
      expect(registry[id]).toBeDefined();
    }
  });

  it("renders a distinct email for every step", async () => {
    const rendered = await Promise.all(
      ONBOARDING_STEP_IDS.map(async (id) => ({
        id,
        html: await render(
          registry[id].component(previewPropsFor(id) as never),
        ),
      })),
    );

    const byHtml = new Map<string, string>();

    for (const { id, html } of rendered) {
      const clash = byHtml.get(html);

      expect(clash, `${id} renders identically to ${clash}`).toBeUndefined();
      byHtml.set(html, id);
    }
  });

  it("gives every step a distinct subject", () => {
    const subjects = ONBOARDING_STEP_IDS.map((id) =>
      registry[id].subject(previewPropsFor(id) as never),
    );

    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it("keeps subjects short enough not to be truncated", () => {
    for (const id of ONBOARDING_STEP_IDS) {
      const subject = registry[id].subject(previewPropsFor(id) as never);

      expect(subject.length).toBeGreaterThan(0);
      expect(subject.length).toBeLessThanOrEqual(78);
    }
  });

  it("shows an unsubscribe link when one is supplied", async () => {
    const html = await render(
      registry.welcome.component({
        to: "ada@4mica.io",
        userName: "Ada",
        unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.a.b",
      }),
    );

    expect(html).toContain("Unsubscribe from onboarding emails");
    expect(html).toContain("unsubscribe?token=v1.a.b");
  });

  it("omits the unsubscribe line entirely when none is supplied", async () => {
    const html = await render(
      registry.welcome.component({ to: "ada@4mica.io", userName: "Ada" }),
    );

    expect(html).not.toContain("Unsubscribe from onboarding emails");
  });
});
