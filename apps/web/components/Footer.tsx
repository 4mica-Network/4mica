"use client";

import { links, routes } from "@4mica/url";
import Link from "next/link";
import { solutions } from "../app/solutions/data";

const footerLinkClass = "text-ink-body transition-colors hover:text-ink-strong";

function ExternalFooterLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center text-ink-body transition-colors hover:text-ink-strong"
    >
      {label}
      <i className="ri-arrow-right-up-line ml-1 hidden text-md transition-transform duration-200 group-hover:block" />
    </a>
  );
}

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="flex w-full select-none justify-center pt-36 pb-6 text-md">
      <div className="flex size-full max-w-300 flex-col items-center justify-center">
        <div className="grid size-full grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">Solutions</div>
            {solutions.map((solution) => (
              <Link
                key={solution.slug}
                href={`/solutions/${solution.slug}`}
                className={footerLinkClass}
              >
                {solution.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">Product</div>
            <Link href="/solution" className={footerLinkClass}>
              Solution
            </Link>
            <Link href="/pricing" className={footerLinkClass}>
              Pricing
            </Link>
            <Link
              href={links.status}
              className="group flex items-center text-ink-body transition-colors hover:text-ink-strong"
              target="_blank"
              rel="noreferrer"
            >
              System status
              <i className="ri-arrow-right-up-line ml-1 hidden text-md transition-transform duration-200 group-hover:block" />
            </Link>
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">Developers</div>
            <ExternalFooterLink href={links.status} label="API status" />
            <ExternalFooterLink
              href={links.social.githubCore}
              label="API changelog"
            />
            <ExternalFooterLink
              href={links.social.github}
              label="Libraries and SDKs"
            />
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">Company</div>
            <Link href={routes.about} className={footerLinkClass}>
              About
            </Link>
            <Link href={routes.careers} className={footerLinkClass}>
              Jobs
            </Link>
            <Link href={routes.leadership} className={footerLinkClass}>
              Team
            </Link>
            <Link href={`${routes.about}#roadmap`} className={footerLinkClass}>
              Roadmap
            </Link>
            <a href={links.mailto.contact} className={footerLinkClass}>
              Contact sales
            </a>
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">Support</div>
            <a href={links.mailto.contact} className={footerLinkClass}>
              Get support
            </a>
            <a href={links.mailto.contact} className={footerLinkClass}>
              Managed support plans
            </a>
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">Resources</div>
            <Link href={routes.terms} className={footerLinkClass}>
              Licences
            </Link>
            <Link href={routes.terms} className={footerLinkClass}>
              Prohibited and restricted businesses
            </Link>
            <Link href="/sitemap.xml" className={footerLinkClass}>
              Sitemap
            </Link>
            <Link href={routes.privacy} className={footerLinkClass}>
              Privacy
            </Link>
            <Link href={routes.terms} className={footerLinkClass}>
              Terms
            </Link>
          </div>
        </div>

        <div className="mt-14 flex w-full flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="order-1 font-light text-ink-body text-md sm:order-2">
            4Mica © {currentYear}
          </div>

          <div className="flex w-full items-center justify-between sm:order-2 sm:w-auto sm:gap-4">
            <a
              href={links.mailto.contact}
              aria-label="Email 4Mica"
              className={footerLinkClass}
            >
              <i className="ri-mail-line text-xl" />
            </a>
            <Link
              href={links.social.github}
              target="_blank"
              rel="noreferrer"
              aria-label="4Mica on GitHub"
              className={footerLinkClass}
            >
              <i className="ri-github-line text-xl" />
            </Link>
            <Link
              href={links.social.linkedin}
              target="_blank"
              rel="noreferrer"
              aria-label="4Mica on LinkedIn"
              className={footerLinkClass}
            >
              <i className="ri-linkedin-line text-xl" />
            </Link>
            <Link
              href={links.social.x}
              target="_blank"
              rel="noreferrer"
              aria-label="4Mica on X"
              className={footerLinkClass}
            >
              <i className="ri-twitter-x-line text-xl" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
