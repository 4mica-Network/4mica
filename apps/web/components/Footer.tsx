"use client";

import { links, routes } from "@4mica/url";
import ThemeToggle from "@components/ThemeToggle";
import Link from "next/link";
import { messages } from "@/i18n";
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
            <div className="mb-2 font-medium text-ink-strong">
              {messages.footer.sections.solutions}
            </div>
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
            <div className="mb-2 font-medium text-ink-strong">
              {messages.footer.sections.product}
            </div>
            <Link href="/solution" className={footerLinkClass}>
              {messages.footer.product.solution}
            </Link>
            <Link href="/pricing" className={footerLinkClass}>
              {messages.footer.product.pricing}
            </Link>
            <Link
              href={links.status}
              className="group flex items-center text-ink-body transition-colors hover:text-ink-strong"
              target="_blank"
              rel="noreferrer"
            >
              {messages.footer.product.systemStatus}
              <i className="ri-arrow-right-up-line ml-1 hidden text-md transition-transform duration-200 group-hover:block" />
            </Link>
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">
              {messages.footer.sections.developers}
            </div>
            <ExternalFooterLink
              href={links.docs}
              label={messages.navigation.documentation}
            />
            <ExternalFooterLink
              href={links.status}
              label={messages.navigation.apiStatus}
            />
            <ExternalFooterLink
              href={links.docsChangelog}
              label={messages.navigation.apiChangelog}
            />
            <ExternalFooterLink
              href={links.social.github}
              label={messages.navigation.librariesAndSdks}
            />
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">
              {messages.footer.sections.company}
            </div>
            <Link href={routes.about} className={footerLinkClass}>
              {messages.footer.company.about}
            </Link>
            <Link href={routes.careers} className={footerLinkClass}>
              {messages.footer.company.jobs}
            </Link>
            <Link href={routes.team} className={footerLinkClass}>
              {messages.footer.company.team}
            </Link>
            <Link href={`${routes.about}#roadmap`} className={footerLinkClass}>
              {messages.footer.company.roadmap}
            </Link>
            <a href={links.mailto.sales} className={footerLinkClass}>
              {messages.footer.company.contactSales}
            </a>
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">
              {messages.footer.sections.support}
            </div>
            <a href={links.mailto.support} className={footerLinkClass}>
              {messages.footer.support.getSupport}
            </a>
            <a href={links.mailto.support} className={footerLinkClass}>
              {messages.footer.support.managedSupportPlans}
            </a>
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">
              {messages.footer.sections.resources}
            </div>
            <Link href={routes.terms} className={footerLinkClass}>
              {messages.footer.resources.licences}
            </Link>
            <Link
              href="/legal/restricted-businesses"
              className={footerLinkClass}
            >
              {messages.footer.resources.restrictedBusinesses}
            </Link>
            <Link href="/sitemap.xml" className={footerLinkClass}>
              {messages.footer.resources.sitemap}
            </Link>
            <Link href={routes.privacy} className={footerLinkClass}>
              {messages.footer.resources.privacy}
            </Link>
            <Link href={routes.terms} className={footerLinkClass}>
              {messages.footer.resources.terms}
            </Link>
            <Link href="/dpa" className={footerLinkClass}>
              {messages.footer.resources.dpa}
            </Link>
          </div>
        </div>

        <div className="mt-14 flex w-full flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="order-1 font-light text-ink-body text-md sm:order-2">
            4Mica © {currentYear}
          </div>

          <div className="flex w-full items-center justify-between sm:order-2 sm:w-auto sm:gap-4">
            <ThemeToggle />
            <a
              href={links.mailto.support}
              aria-label={messages.common.a11y.email4Mica}
              className={footerLinkClass}
            >
              <i className="ri-mail-line text-xl" />
            </a>
            <Link
              href={links.social.github}
              target="_blank"
              rel="noreferrer"
              aria-label={messages.common.a11y.github}
              className={footerLinkClass}
            >
              <i className="ri-github-line text-xl" />
            </Link>
            <Link
              href={links.social.linkedin}
              target="_blank"
              rel="noreferrer"
              aria-label={messages.common.a11y.linkedin}
              className={footerLinkClass}
            >
              <i className="ri-linkedin-line text-xl" />
            </Link>
            <Link
              href={links.social.x}
              target="_blank"
              rel="noreferrer"
              aria-label={messages.common.a11y.x}
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
