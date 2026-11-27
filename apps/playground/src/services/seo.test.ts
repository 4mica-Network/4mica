import { describe, expect, it } from "vitest";
import type { PublicAgent } from "@/schema/agent";
import type { PublicProfile } from "@/schema/profile";
import { descriptorResponse } from "./descriptor-response";
import { buildAgentMetadata, buildProfileMetadata, isIndexable } from "./seo";

const profile = (over: Partial<PublicProfile> = {}) =>
  ({
    username: "ada",
    name: "Ada",
    bio: "Builds agents.",
    allowSEOIndexing: true,
    isPublished: true,
    ...over,
  }) as PublicProfile;

const agent = (over: Partial<PublicAgent> = {}) =>
  ({
    ref: "atlas",
    name: "Atlas",
    headline: "Research agent",
    visibility: "PUBLIC",
    ...over,
  }) as PublicAgent;

describe("isIndexable", () => {
  it("indexes only when the owner allows it, the profile is published and the item is public", () => {
    expect(isIndexable(profile())).toBe(true);
    expect(isIndexable(profile(), "PUBLIC")).toBe(true);
    expect(isIndexable(profile({ allowSEOIndexing: false }))).toBe(false);
    expect(isIndexable(profile({ isPublished: false }))).toBe(false);
    expect(isIndexable(profile(), "PRIVATE")).toBe(false);
  });
});

describe("page robots", () => {
  it("follows the owner's indexing setting on the profile page", () => {
    expect(buildProfileMetadata(profile()).robots).toMatchObject({
      index: true,
      follow: true,
    });
    expect(
      buildProfileMetadata(profile({ allowSEOIndexing: false })).robots,
    ).toMatchObject({ index: false, follow: false });
  });

  it("keeps an agent out of search unless both it and the profile allow it", () => {
    expect(buildAgentMetadata(profile(), agent()).robots).toMatchObject({
      index: true,
    });
    expect(
      buildAgentMetadata(profile({ allowSEOIndexing: false }), agent()).robots,
    ).toMatchObject({ index: false });
    expect(
      buildAgentMetadata(profile(), agent({ visibility: "PRIVATE" })).robots,
    ).toMatchObject({ index: false });
  });
});

describe("descriptor headers", () => {
  const descriptor = {} as Parameters<typeof descriptorResponse>[0];

  it("hides a public resource's descriptor from search when its owner opted out", () => {
    const response = descriptorResponse(descriptor, {
      visible: true,
      indexable: false,
    });

    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("cache-control")).toMatch(/^public/);
  });

  it("lets an indexable descriptor be crawled", () => {
    const response = descriptorResponse(descriptor, {
      visible: true,
      indexable: true,
    });

    expect(response.headers.get("x-robots-tag")).toBe("all");
  });

  it("never caches a private resource's descriptor publicly", () => {
    const response = descriptorResponse(descriptor, {
      visible: false,
      indexable: false,
    });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
