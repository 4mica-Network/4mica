import { links, routes } from "@4mica/url";
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
    label: "Solutions",
    children: [
      {
        title: "By use case",
        items: solutionItems,
      },
    ],
  },
  {
    label: "Developers",
    children: [
      {
        items: [
          {
            title: "Documentation",
            href: links.docs,
            description: "Guides and reference",
            icon: "ri-book-2-line",
            external: true,
          },
          {
            title: "API reference",
            href: routes.technicalDocs,
            description: "Endpoints and schemes",
            icon: "ri-code-s-slash-line",
          },
          {
            title: "API status",
            href: links.status,
            description: "Live uptime",
            icon: "ri-pulse-line",
            external: true,
          },
          {
            title: "API changelog",
            href: links.social.githubCore,
            description: "Releases and updates",
            icon: "ri-git-commit-line",
            external: true,
          },
          {
            title: "Libraries and SDKs",
            href: links.social.github,
            description: "TypeScript and Python",
            icon: "ri-terminal-box-line",
            external: true,
          },
          {
            title: "Developer blog",
            href: routes.blog,
            description: "Engineering notes",
            icon: "ri-article-line",
          },
        ],
      },
    ],
  },
];
