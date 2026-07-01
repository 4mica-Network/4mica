import { links, routes } from "@4mica/url";
import { messages } from "@/i18n";

export const benefits = messages.sharedContent.benefits;

export const companyLinks = [
  { href: routes.about, label: messages.sharedContent.companyLinks.mission },
  { href: routes.team, label: messages.sharedContent.companyLinks.team },
  {
    href: `${routes.about}#roadmap`,
    label: messages.sharedContent.companyLinks.roadmap,
  },
];

export const primaryLinks = [
  { href: "/pricing", label: messages.sharedContent.primaryLinks.pricing },
  { href: "/solution", label: messages.sharedContent.primaryLinks.solution },
];

export const githubUrl = links.social.githubCore;

export const hooks = [
  {
    label: messages.sharedContent.hooks.starOnGithub,
    href: githubUrl,
  },
  {
    label: messages.sharedContent.hooks.buildWithUs,
    href: githubUrl,
  },
  {
    label: messages.sharedContent.hooks.requestEarlyAccess,
    href: links.mailto.earlyAccess,
  },
];

export const aboutCards = [
  {
    title: messages.sharedContent.aboutCards[0].title,
    description: messages.sharedContent.aboutCards[0].description,
    href: routes.about,
  },
  {
    title: messages.sharedContent.aboutCards[1].title,
    description: messages.sharedContent.aboutCards[1].description,
    href: routes.team,
  },
  {
    title: messages.sharedContent.aboutCards[2].title,
    description: messages.sharedContent.aboutCards[2].description,
    href: `${routes.about}#roadmap`,
  },
];

export const SECURITY_POINTS = messages.sharedContent.securityPoints;

export const steps = messages.sharedContent.steps;
