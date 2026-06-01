"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-transparent py-12 text-ink">
      <div className="container mx-auto px-6">
        <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link
              href="/"
              className="mb-4 block font-bold font-pacifico text-3xl"
            >
              4Mica
            </Link>
            <p className="max-w-md text-ink/80 leading-relaxed">
              Instant, cryptographically-backed lines-of-credit for any product.
              Secure, seamless, and decentralized.
            </p>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-lg">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="link-muted cursor-pointer">
                  4Mica Mission
                </Link>
              </li>
              <li>
                <Link href="/leadership" className="link-muted cursor-pointer">
                  Team
                </Link>
              </li>
              <li>
                <Link href="/#resources" className="link-muted cursor-pointer">
                  Resources
                </Link>
              </li>
              <li>
                <Link href="/roadmap" className="link-muted cursor-pointer">
                  Roadmap
                </Link>
              </li>
              <li>
                <Link href="/careers" className="link-muted cursor-pointer">
                  Careers
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-lg">Follow Us</h4>
            <div className="flex space-x-4">
              <Link
                href="https://x.com/0x4Mica"
                className="link-muted cursor-pointer"
              >
                <div className="flex h-6 w-6 items-center justify-center">
                  <i className="ri-twitter-line text-xl"></i>
                </div>
              </Link>
              <Link
                href="https://www.linkedin.com/company/4mica"
                className="link-muted cursor-pointer"
              >
                <div className="flex h-6 w-6 items-center justify-center">
                  <i className="ri-linkedin-line text-xl"></i>
                </div>
              </Link>
              <Link
                href="https://github.com/4mica-Network"
                className="link-muted cursor-pointer"
              >
                <div className="flex h-6 w-6 items-center justify-center">
                  <i className="ri-github-line text-xl"></i>
                </div>
              </Link>
            </div>
          </div>
        </div>

        <div className="border-ink/20 border-t pt-8">
          <div className="flex flex-col items-center justify-between md:flex-row">
            <p className="mb-4 text-ink/80 md:mb-0">
              © 2026 4Mica. All rights reserved
            </p>
            <div className="flex space-x-6">
              <Link
                href="/privacy"
                className="link-muted cursor-pointer whitespace-nowrap"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="link-muted cursor-pointer whitespace-nowrap"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
