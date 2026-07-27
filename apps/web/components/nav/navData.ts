import { links } from "@4mica/url";
import { messages } from "@/i18n";
import {
  customerSolutions,
  useCaseSolutions,
} from "../../app/(site)/solutions/data";

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
  /** Large-screen placement of the dropdown panel. Defaults to "center". */
  align?: "center" | "left";
};

const toNavItem = (solution: {
  slug: string;
  label: string;
  description: string;
  icon: string;
}): NavLinkItem => ({
  title: solution.label,
  href: `/solutions/${solution.slug}`,
  description: solution.description,
  icon: solution.icon,
});

// Audience pages come first: facilitators are the primary customer.
const customerItems: NavLinkItem[] = customerSolutions.map(toNavItem);
const useCaseItems: NavLinkItem[] = useCaseSolutions.map(toNavItem);

export const NAV_ITEMS: NavItem[] = [
  {
    label: messages.navigation.solutions,
    // Leftmost, widest panel: anchor to the trigger's left edge so it opens
    // rightward instead of spilling off to the left when centered.
    align: "left",
    children: [
      {
        title: messages.navigation.byCustomer,
        items: customerItems,
      },
      {
        title: messages.navigation.byUseCase,
        items: useCaseItems,
      },
    ],
  },
  {
    label: messages.navigation.developers,
    children: [
      {
        items: [
          {
            title: messages.navigation.documentation,
            href: links.docs,
            description: messages.navigation.documentationDescription,
            icon: "ri-book-open-line",
            external: true,
          },
          {
            title: messages.navigation.apiStatus,
            href: links.status,
            description: messages.navigation.apiStatusDescription,
            icon: "ri-pulse-line",
            external: true,
          },
          {
            title: messages.navigation.apiChangelog,
            href: links.docsChangelog,
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
          {
            title: messages.navigation.blog,
            href: links.blog,
            description: messages.navigation.blogDescription,
            icon: "ri-article-line",
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
