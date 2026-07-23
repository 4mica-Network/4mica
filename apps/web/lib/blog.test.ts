import { slugify } from "@components/slugify";
import { describe, expect, it } from "vitest";
import {
  formatPostDate,
  getAllBlogPosts,
  getBlogPost,
  getBlogSlugs,
  parseBlogPost,
} from "./blog";

const frontmatter = (extra = "") => `---
title: A post
description: What the post is about.
date: 2026-07-15
author: Mairon Mahzoun
${extra}---

## First heading

Body text.
`;

describe("parseBlogPost", () => {
  it("normalizes a YAML date to an ISO day", () => {
    const { meta } = parseBlogPost("a-post", frontmatter());
    expect(meta.date).toBe("2026-07-15");
  });

  it("defaults optional fields", () => {
    const { meta } = parseBlogPost("a-post", frontmatter());
    expect(meta.tags).toEqual([]);
    expect(meta.keywords).toEqual([]);
    expect(meta.thumbnail).toBeUndefined();
    expect(meta.authorAvatar).toBeUndefined();
    expect(meta.draft).toBe(false);
  });

  it("reads the author avatar when one is set", () => {
    const { meta } = parseBlogPost(
      "a-post",
      frontmatter("authorAvatar: /assets/mairon.jpg\n"),
    );
    expect(meta.authorAvatar).toBe("/assets/mairon.jpg");
  });

  it("coerces a scalar tag to an array", () => {
    const { meta } = parseBlogPost("a-post", frontmatter("tags: x402\n"));
    expect(meta.tags).toEqual(["x402"]);
  });

  it("names the file and the missing fields when frontmatter is incomplete", () => {
    expect(() =>
      parseBlogPost("broken", "---\ntitle: Only a title\n---\n\nBody.\n"),
    ).toThrow(/content\/blog\/broken\.mdx.*description, date, author/);
  });

  it("strips the frontmatter from the returned body", () => {
    const { content } = parseBlogPost("a-post", frontmatter());
    expect(content).not.toContain("title:");
    expect(content).toContain("## First heading");
  });
});

describe("blog registry", () => {
  const posts = getAllBlogPosts();

  it("finds the seeded posts", () => {
    expect(posts.length).toBeGreaterThan(0);
    expect(getBlogSlugs()).toContain("how-4mica-works");
  });

  it("orders posts newest first", () => {
    const dates = posts.map((post) => post.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("anchors every TOC entry to a slugified heading", () => {
    const post = getBlogPost("how-4mica-works");
    expect(post?.toc.length).toBeGreaterThan(0);
    for (const { id, text } of post?.toc ?? []) {
      expect(id).toBe(slugify(text));
    }
  });

  it("returns undefined for an unknown slug", () => {
    expect(getBlogPost("does-not-exist")).toBeUndefined();
  });
});

describe("formatPostDate", () => {
  it("formats in UTC so SSG output is stable", () => {
    expect(formatPostDate("2026-07-15")).toBe("July 15, 2026");
  });
});
