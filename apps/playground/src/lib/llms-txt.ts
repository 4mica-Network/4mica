import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import type { PublicProfile } from "@/schema/profile";
import { links } from "@/services/links";
import {
  buildAgentDescriptor,
  buildApiListingDescriptor,
  type ResourceDescriptor,
} from "./descriptor";

const line = (label: string, value: string | null): string | null =>
  value === null ? null : `  - ${label}: ${value}`;

const entrySection = (descriptor: ResourceDescriptor): string => {
  const price = descriptor.payment?.price.display ?? null;
  const rows = [
    descriptor.summary ? `  ${descriptor.summary}` : null,
    line("Page", descriptor.page),
    line("Machine descriptor", descriptor.descriptor),
    line("Price", price === null ? null : `${price} per request`),
    line("Network", descriptor.payment?.networkLabel ?? null),
    line("Pay to", descriptor.payment?.payTo ?? null),
    line(
      "Call",
      descriptor.resource
        ? `${descriptor.resource.method} ${descriptor.resource.url}`
        : null,
    ),
    line("Docs", descriptor.docs),
    line(
      "Status",
      descriptor.invocable
        ? "ready to call"
        : "not payable yet — no receiving wallet or endpoint",
    ),
  ].filter((row): row is string => row !== null);

  return [`### ${descriptor.name}`, ...rows, ""].join("\n");
};

export const buildProfileLlmsTxt = (
  profile: PublicProfile,
  listings: PublicApiListing[],
  agents: PublicAgent[],
): string => {
  const title = profile.name || `@${profile.username}`;
  const apis = listings.map((listing) =>
    buildApiListingDescriptor(listing, profile),
  );
  const bots = agents.map((agent) => buildAgentDescriptor(agent, profile));

  const sections: string[] = [
    `# ${title} on 4Mica`,
    "",
    `> ${profile.bio || profile.description || `Paid APIs and agents published by @${profile.username}.`}`,
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
  ];

  if (apis.length > 0) {
    sections.push("## APIs", "", ...apis.map(entrySection), "");
  }

  if (bots.length > 0) {
    sections.push("## Agents", "", ...bots.map(entrySection), "");
  }

  if (apis.length === 0 && bots.length === 0) {
    sections.push("## Resources", "", "No published resources yet.", "");
  }

  return `${sections.join("\n")}\n`;
};
