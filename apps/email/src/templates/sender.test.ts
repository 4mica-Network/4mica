import { ONBOARDING_STEP_IDS, templateIds } from "@4mica/email-client";
import { sender } from "@components/index";
import { getTemplate } from "@templates/registry";
import { render } from "react-email";
import { describe, expect, it } from "vitest";

const PERSONAL_IDS = [
  ...ONBOARDING_STEP_IDS,
  "waitlist-confirmation",
  "waitlist-invitation",
] as const;

// Only the emails that earn a sign-off carry one: first contact, the thesis,
// the custody question, the series close, and the two waitlist notes. Signing
// all thirty would make the signature furniture rather than a person.
const SIGNED_IDS = [
  "welcome",
  "onboarding-microtransactions",
  "onboarding-no-custodial-risk",
  "onboarding-go-live-and-support",
  "waitlist-confirmation",
  "waitlist-invitation",
] as const;

const componentFor = (id: (typeof templateIds)[number]) => {
  const definition = getTemplate(id);
  const previewProps = (
    definition.component as unknown as { PreviewProps: Record<string, unknown> }
  ).PreviewProps;

  return definition.component(previewProps as never);
};

// Read the plain-text render: the HTML one escapes the `&` in the role line,
// so asserting on `sender.role` against it would compare unlike strings.
const renderById = (id: (typeof templateIds)[number]) =>
  render(componentFor(id), { plainText: true });

describe("sender identity", () => {
  it.each(PERSONAL_IDS)("sends %s under a person's name", (id) => {
    expect(getTemplate(id).fromName).toBe(sender.fromName);
  });

  it.each(SIGNED_IDS)("signs %s", async (id) => {
    const text = await renderById(id);

    expect(text).toContain(`— ${sender.firstName}`);
    expect(text).toContain(sender.role);
  });

  it.each(
    PERSONAL_IDS.filter(
      (id) => !(SIGNED_IDS as readonly string[]).includes(id),
    ),
  )("leaves %s unsigned", async (id) => {
    expect(await renderById(id)).not.toContain(sender.role);
  });

  // The sign-off closes the message, so the button reads as what to do next
  // rather than as something bolted on after a goodbye.
  it.each(SIGNED_IDS)("puts the sign-off before the CTA in %s", async (id) => {
    const html = await render(componentFor(id));
    const button = html.indexOf("mso-padding-alt");

    if (button === -1) {
      return; // waitlist-confirmation has no call to action
    }

    expect(html.indexOf("co-founder")).toBeGreaterThan(-1);
    expect(html.indexOf("co-founder")).toBeLessThan(button);
  });

  // A receipt or a dispute notice signed personally reads as a form letter
  // pretending not to be one, so transactional mail keeps the product's name.
  it("leaves transactional mail in the product's voice", () => {
    const transactional = templateIds.filter(
      (id) => !(PERSONAL_IDS as readonly string[]).includes(id),
    );

    expect(transactional.length).toBeGreaterThan(0);

    for (const id of transactional) {
      expect(getTemplate(id).fromName, `${id} should not be personal`).toBe(
        undefined,
      );
    }
  });
});
