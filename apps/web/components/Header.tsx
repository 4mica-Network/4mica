"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const companyLinks = [
    { href: "/about", label: "4Mica Mission" },
    { href: "/leadership", label: "Team" },
    { href: "/roadmap", label: "Roadmap" },
  ];

  const primaryLinks = [
    { href: "/resources/technical-docs", label: "Documents" },
    { href: "/resources", label: "Resources" },
  ];

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`sticky top-0 z-40 text-ink transition-all duration-300 ease-out ${
          isScrolled
            ? "glass-panel-strong translate-y-2"
            : "translate-y-0 bg-transparent"
        }`}
      >
        <nav className="container mx-auto flex items-center justify-between px-8 py-6">
          <Link href="/" className="flex items-center space-x-3">
            <Image
              src="/assets/logo_transparent.png"
              alt="4Mica logo"
              width={180}
              height={60}
              className="h-10 w-auto rounded-lg object-cover"
              priority
            />
            <span className="font-bold font-pacifico text-2xl">4Mica</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <div className="flex items-center space-x-8">
              <div className="group relative">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-ink transition-colors hover:text-brand-strong"
                >
                  Company
                  <i className="ri-arrow-down-s-line text-lg"></i>
                </button>
                <div className="pointer-events-none absolute top-full left-0 translate-y-2 pt-2 opacity-0 transition-all duration-200 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                  <div className="glass-panel-strong w-52 rounded-xl border border-white/10 shadow-lg">
                    {companyLinks.map((item, index) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block px-4 py-3 text-ink text-sm transition-colors hover:text-brand-strong ${
                          index > 0 ? "border-white/10 border-t" : ""
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
              {primaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="cursor-pointer whitespace-nowrap text-ink transition-colors hover:text-brand-strong"
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="mailto:mairon@4mica.xyz"
                className="whitespace-nowrap text-ink transition-colors hover:text-brand-strong"
              >
                Contact Us
              </a>
            </div>
          </div>

          <div className="md:hidden">
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className="text-ink"
            >
              <span className="sr-only">Toggle menu</span>
              <div className="flex h-6 w-6 items-center justify-center">
                <i
                  className={`ri-${isMobileMenuOpen ? "close-line" : "menu-line"} text-xl`}
                ></i>
              </div>
            </button>
          </div>
        </nav>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div
            id="mobile-menu"
            className="glass-panel-strong absolute top-20 right-4 left-4 rounded-2xl p-6"
          >
            <div className="section-kicker">Company</div>
            <div className="mt-3 space-y-2">
              {companyLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block text-ink text-sm transition-colors hover:text-brand-strong"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="section-kicker mt-6">Explore</div>
            <div className="mt-3 space-y-2">
              {primaryLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block text-ink text-sm transition-colors hover:text-brand-strong"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href="mailto:mairon@4mica.xyz"
                className="block text-ink text-sm transition-colors hover:text-brand-strong"
              >
                Contact Us
              </a>
            </div>
            <div className="mt-6 grid gap-3">
              <Link
                href="/resources/technical-docs"
                onClick={() => setIsMobileMenuOpen(false)}
                className="btn btn-primary btn-md text-center"
              >
                Start Building
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
