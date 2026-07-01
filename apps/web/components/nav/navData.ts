import { links } from "@4mica/url";
import { messages } from "@/i18n";
import { solutions } from "../../app/solutions/data";

export type NavLinkItem = {
  title: string;
  href: string;
  description?: string;
  icon?: string;
  external?: boolean;
};

export type NavSection = {
  title?: string;
  items: NavLinkItem[];
};

export type NavItem = {
  label: string;
  href?: string;
  external?: boolean;
  children?: NavSection[];
};

const solutionItems: NavLinkItem[] = solutions.map((solution) => ({
  title: solution.label,
  href: `/solutions/${solution.slug}`,
  description: solution.description,
  icon: solution.icon,
}));

export const NAV_ITEMS: NavItem[] = [
  {
    label: messages.navigation.solutions,
    children: [
      {
        title: messages.navigation.byUseCase,
        items: solutionItems,
      },
    ],
  },
  {
    label: messages.navigation.developers,
    children: [
      {
        items: [
          {
            title: messages.navigation.apiStatus,
            href: links.status,
            description: messages.navigation.apiStatusDescription,
            icon: "ri-pulse-line",
            external: true,
          },
          {
            title: messages.navigation.apiChangelog,
            href: links.social.githubCore,
            description: messages.navigation.apiChangelogDescription,
            icon: "ri-git-commit-line",
            external: true,
          },
          {
            title: messages.navigation.librariesAndSdks,
            href: links.social.github,
            description: messages.navigation.librariesAndSdksDescription,
            icon: "ri-terminal-box-line",
            external: true,
          },
        ],
      },
    ],
  },
  {
    label: messages.navigation.pricing,
    href: "/pricing",
  },
];
