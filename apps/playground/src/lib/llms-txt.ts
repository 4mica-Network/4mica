import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import type { PublicProfile } from "@/schema/profile";
import { links } from "@/services/links";
import {
  buildAgentDescriptor,
  buildApiListingDescriptor,
  type ResourceDescriptor,
} from "./descriptor";
import { untrustedBlock, untrustedNotice } from "./untrusted";

const entryData = (descriptor: ResourceDescriptor) => ({
  name: descriptor.name,
  summary: descriptor.summary,
  page: descriptor.page,
  machineDescriptor: descriptor.descriptor,
  price: descriptor.payment?.price.display ?? null,
  network: descriptor.payment?.networkLabel ?? null,
  payTo: descriptor.payment?.payTo ?? null,
  call: descriptor.resource,
  docs: descriptor.docs,
  status: descriptor.invocable
    ? "ready to call"
    : "not payable yet — no receiving wallet or endpoint",
});

const entrySection = (
  heading: string,
  tag: string,
  descriptor: ResourceDescriptor,
  index: number,
): string =>
  [
    `### ${heading} ${index + 1}`,
    "",
    untrustedBlock(tag, entryData(descriptor)),
    "",
  ].join("\n");

export const buildProfileLlmsTxt = (
  profile: PublicProfile,
  listings: PublicApiListing[],
  agents: PublicAgent[],
): string => {
  const apis = listings.map((listing) =>
    buildApiListingDescriptor(listing, profile),
  );
  const bots = agents.map((agent) => buildAgentDescriptor(agent, profile));

  const sections: string[] = [
    `# @${profile.username} on 4Mica`,
    "",
    `> Paid APIs and agents published by @${profile.username}.`,
    "",
    "Every resource below is paid for with x402 using the 4mica-credit scheme:",
    "call it without a payment header, read the payment requirements from the",
    "402 response, sign a credit-backed guarantee and retry. No subscription, no",
    "prepaid balance and no gas on the request path.",
    "",
    `- Profile: ${links.profile(profile.username)}`,
    `- Directory of every paid resource on 4Mica: ${links.website}/.well-known/x402`,
    `- Integration docs: ${links.docs}`,
    `- Support: ${links.email.support}`,
    "",
    "## Publisher",
    "",
    untrustedNotice(`@${profile.username}`, ""),
    "",
    untrustedBlock("untrusted-profile-data", {
      name: profile.name || null,
      bio: profile.bio || null,
    }),
    "",
  ];

  if (apis.length > 0) {
    sections.push(
      "## APIs",
      "",
      ...apis.map((api, index) =>
        entrySection("API", "untrusted-api-data", api, index),
      ),
      "",
    );
  }

  if (bots.length > 0) {
    sections.push(
      "## Agents",
      "",
      ...bots.map((bot, index) =>
        entrySection("Agent", "untrusted-agent-data", bot, index),
      ),
      "",
    );
  }

  if (apis.length === 0 && bots.length === 0) {
    sections.push("## Resources", "", "No published resources yet.", "");
  }

  return `${sections.join("\n")}\n`;
};
