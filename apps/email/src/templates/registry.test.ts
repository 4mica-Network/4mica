import { templateIds, templateSchemas } from "@4mica/email-client";
import { render } from "react-email";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { getTemplate, registry } from "./registry";

describe("template registry", () => {
  it("has exactly one entry per template id", () => {
    expect(Object.keys(registry).sort()).toEqual([...templateIds].sort());
  });

  it.each(
    templateIds,
  )("renders %s from its preview props with a non-empty subject", async (id) => {
    const definition = getTemplate(id);
    const previewProps = (
      definition.component as unknown as { PreviewProps?: unknown }
    ).PreviewProps;

    expect(previewProps, `${id} is missing PreviewProps`).toBeDefined();

    const parsed = v.safeParse(templateSchemas[id], previewProps);
    expect(
      parsed.success,
      `${id} preview props fail their own schema: ${JSON.stringify(
        parsed.success ? [] : parsed.issues.map((issue) => issue.message),
      )}`,
    ).toBe(true);

    if (!parsed.success) {
      return;
    }

    const props = parsed.output as never;
    const subject = definition.subject(props);
    expect(subject.length).toBeGreaterThan(0);

    const html = await render(definition.component(props));
    expect(html).toContain("<html");
    expect(html.length).toBeGreaterThan(200);

    const text = await render(definition.component(props), {
      plainText: true,
    });
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it("only overrides reply-to with a real address", () => {
    for (const id of templateIds) {
      const { replyTo } = getTemplate(id);

      if (replyTo !== undefined) {
        expect(replyTo).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      }
    }
  });
});
