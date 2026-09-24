import { RevealLink } from "@/components/RevealLink";
import { messages, t } from "@/i18n";
import { links } from "@/services/links";
import type { PublicProfile } from "@/types";
import { profilePath } from "@/utils/profileUrl";

export interface SupportSectionProps {
  profile: PublicProfile;
  resourceName: string;
}

const mailto = (address: string, subject: string): string =>
  `mailto:${address}?subject=${encodeURIComponent(subject)}`;

export function SupportSection({ profile, resourceName }: SupportSectionProps) {
  const sellerName = profile.name || `@${profile.username}`;

  const sellerHref = profile.email
    ? mailto(
        profile.email,
        t(messages.support.emailSubject, { resource: resourceName }),
      )
    : profile.phoneNumber
      ? `tel:${profile.phoneNumber}`
      : profilePath(profile.username);

  return (
    <section className="flex flex-col gap-1 border-overlay/10 border-t pt-6">
      <h2 className="font-medium text-ink-strong text-sm">
        {messages.support.heading}
      </h2>

      <div className="flex flex-col items-start">
        <RevealLink className="py-1" href={sellerHref}>
          {t(messages.support.askSeller, { name: sellerName })}
        </RevealLink>

        <RevealLink
          className="py-1"
          href={mailto(
            links.email.support,
            t(messages.support.supportSubject, {
              resource: `${resourceName} (@${profile.username})`,
            }),
          )}
        >
          {messages.support.askTeam}
        </RevealLink>

        <RevealLink className="py-1" external href={links.docs}>
          {messages.support.readDocs}
        </RevealLink>
      </div>
    </section>
  );
}
