import { links } from "@4mica/url";
import { describe, expect, it } from "vitest";
import { DOCS_URL, FUNDING_DOCS } from "./links.js";

describe("the cli's copy of the site's addresses", () => {
  it("has the docs where @4mica/url has them", () => {
    expect(DOCS_URL).toBe(links.docs);
    expect(FUNDING_DOCS.startsWith(`${links.docs}/`)).toBe(true);
  });
});
