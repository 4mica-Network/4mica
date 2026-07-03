import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import { solutionSlugs } from "@/i18n/locales/en/solutions";
import {
  allPagePaths,
  metadataForSlug,
  metaForSolution,
  pageSlugs,
  pathToSlug,
} from "./pages";

const generatedSlugs = pageSlugs().map((entry) => entry.slug);

// The /og/<slug> that a page's metadata points at.
const ogSlug = (metadata: Metadata): string => {
  const images = metadata.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : images;
  const url =
    first && typeof first === "object" && "url" in first ? first.url : first;
  return String(url).replace(/^\/og\//, "");
};

describe("seo page registry", () => {
  it("derives a unique OG slug per page (no collisions)", () => {
    expect(new Set(generatedSlugs).size).toBe(generatedSlugs.length);
  });

  it("generates OG slugs for the pages that used to 404", () => {
    const expected = [
      "pricing",
      "dpa",
      "legal-restricted-businesses",
      `solutions-${solutionSlugs[0]}`,
    ];
    for (const slug of expected) {
      expect(generatedSlugs).toContain(slug);
    }
  });

  it("emits one OG slug per solution", () => {
    for (const slug of solutionSlugs) {
      expect(generatedSlugs).toContain(`solutions-${slug}`);
    }
  });

  it("resolves non-empty metadata for every generated slug", () => {
    for (const slug of generatedSlugs) {
      const metadata = metadataForSlug(slug);
      expect(metadata, `metadata for /og/${slug}`).toBeDefined();
      expect(metadata?.title).toBeTruthy();
      expect(metadata?.description).toBeTruthy();
    }
  });

  it("holds the invariant: every page's OG image slug is itself generated", () => {
    for (const slug of generatedSlugs) {
      const metadata = metadataForSlug(slug);
      expect(metadata).toBeDefined();
      // The image url is /og/<its own slug>, so it must be in the static params.
      expect(generatedSlugs).toContain(ogSlug(metadata as Metadata));
    }
  });

  it("round-trips every canonical path to a generated slug", () => {
    for (const path of allPagePaths()) {
      expect(generatedSlugs).toContain(pathToSlug(path));
    }
  });

  it("returns undefined for an unknown solution", () => {
    expect(metaForSolution("does-not-exist")).toBeUndefined();
  });
});
