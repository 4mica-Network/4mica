"use client";

import { links, routes } from "@4mica/url";
import Link from "next/link";

const footerLinkClass = "text-ink-body transition-colors hover:text-ink-strong";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="flex w-full select-none justify-center pt-36 pb-6 text-md">
      <div className="flex size-full max-w-300 flex-col items-center justify-center">
        <div className="grid size-full grid-cols-1 gap-10 md:grid-cols-3">
          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">Product</div>
            <Link href={routes.register} className={footerLinkClass}>
              Register
            </Link>
            <Link href={routes.agentsRegister} className={footerLinkClass}>
              Agent Registration
            </Link>
            <Link href={routes.technicalDocs} className={footerLinkClass}>
              Documentation
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
            <div className="mb-2 font-medium text-ink-strong">Company</div>
            <Link href={routes.about} className={footerLinkClass}>
              About
            </Link>
            <Link href={routes.blog} className={footerLinkClass}>
              Blog
            </Link>
            <Link href={routes.leadership} className={footerLinkClass}>
              Team
            </Link>
            <Link href={`${routes.about}#roadmap`} className={footerLinkClass}>
              Roadmap
            </Link>
            <Link href={routes.careers} className={footerLinkClass}>
              Careers
            </Link>
            <a href={links.mailto.contact} className={footerLinkClass}>
              Contact us
            </a>
          </div>

          <div className="flex flex-col gap-y-3">
            <div className="mb-2 font-medium text-ink-strong">Resources</div>
            <Link href={routes.resources} className={footerLinkClass}>
              Resources
            </Link>
            <Link href={routes.onePager} className={footerLinkClass}>
              One pager
            </Link>
            <Link href={routes.interactiveProtocol} className={footerLinkClass}>
              Interactive protocol
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
