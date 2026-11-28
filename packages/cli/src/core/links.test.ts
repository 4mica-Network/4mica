import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { LinkConfig, links } from "@4mica/url";
import { describe, expect, it } from "vitest";
import {
  API_URL,
  CLI_DOCS_URL,
  DASHBOARD_URL,
  DOCS_URL,
  FUNDING_DOCS,
} from "./links.js";
import { packageRoot } from "./package-root.js";

describe("the cli's copy of the site's addresses", () => {
  it("has the docs where @4mica/url has them", () => {
    expect(DOCS_URL).toBe(links.docs);
    expect(FUNDING_DOCS.startsWith(`${links.docs}/`)).toBe(true);
  });

  it("has the platform API where the deployment reference puts it", async () => {
    const deployment = await readFile(
      join(packageRoot, "../../.github/DEPLOYMENT.md"),
      "utf8",
    );
    expect(deployment).toContain(`| \`VITE_API_URL\` | \`${API_URL}\` |`);
  });

  it("links to a docs page that exists", async () => {
    const docs = JSON.parse(
      await readFile(join(packageRoot, "../../docs/docs.json"), "utf8"),
    );
    const page = CLI_DOCS_URL.slice(`${DOCS_URL}/`.length);
    expect(JSON.stringify(docs)).toContain(`"${page}"`);
  });

  // `links.app` is whatever the build environment says. The production
  // value is the one the site's own example environment gives `@4mica/url`.
  it("has the dashboard where @4mica/url puts it in production", async () => {
    const example = join(packageRoot, "../../apps/web/.env.example");
    const production = new LinkConfig(
      parseEnv(await readFile(example, "utf8")),
    );
    expect(production.links.app).not.toBe(production.links.website);
    expect(DASHBOARD_URL).toBe(production.links.app);
  });
});
