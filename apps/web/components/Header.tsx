"use client";

import { links, routes } from "@4mica/url";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { messages } from "@/i18n";
import DesktopNav from "./nav/DesktopNav";
import MobileNav from "./nav/MobileNav";

export default function Header() {
  const [isLogoCompact, setIsLogoCompact] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsLogoCompact(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener("keydown", onEscape);
    }

    return () => document.removeEventListener("keydown", onEscape);
  }, [isMobileMenuOpen]);

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-40 flex h-20 w-full select-none justify-center px-4 text-ink transition-colors duration-300 sm:px-6 lg:px-8 ${
        isMobileMenuOpen
          ? "bg-[#000000]"
          : "bg-[linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,0.5)_80%,rgba(0,0,0,0.1)_100%)]"
      }`}
    >
      <nav
        className={`flex size-full max-w-300 items-center justify-between ${
          isMobileMenuOpen ? "overflow-hidden" : ""
        }`}
      >
        <Link
          href={routes.home}
          className="relative box-border flex items-center gap-2"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-md transition-all duration-300 ease-out ${
              isLogoCompact ? "scale-95" : "scale-100"
            }`}
          >
            <Image
              src="/assets/logo_transparent.png"
              alt={messages.common.logoAlt}
              width={72}
              height={72}
              className="h-full w-full object-cover"
              priority
              draggable={false}
            />
          </span>
          <span
            className={`relative font-bold font-pacifico text-xl transition-all duration-300 ease-out ${
              isLogoCompact
                ? "-translate-x-5 scale-y-50 opacity-0"
                : "translate-x-0 scale-100 opacity-100"
            }`}
          >
            {messages.common.brandName}
          </span>
        </Link>

        <DesktopNav />

        <div className="flex items-center gap-3">
          <a
            href={links.mailto.contact}
            className="hidden h-9 items-center justify-center whitespace-nowrap rounded-md border border-white/15 bg-black px-4 py-2 font-semibold text-ink-body text-md transition-colors hover:bg-white/10 hover:text-ink-strong md:flex"
          >
            {messages.common.actions.talkToSales}
          </a>

          <Link
            href="/pricing"
            className="hidden h-9 items-center justify-center whitespace-nowrap rounded-md bg-[#dedede] px-4 py-2 font-semibold text-[#151515] text-md transition-colors duration-75 ease-in hover:bg-white md:flex"
          >
            {messages.common.actions.tryForFree}
          </Link>

          <button
            type="button"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={messages.common.a11y.toggleMobileMenu}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:text-ink-strong md:hidden"
          >
            <span className="sr-only">{messages.common.a11y.toggleMenu}</span>
            <span className="relative block h-4 w-5">
              <span
                className={`absolute top-0 left-0 h-px w-5 bg-current transition-transform duration-200 ${
                  isMobileMenuOpen ? "translate-y-2 rotate-45" : ""
                }`}
              />
              <span
                className={`absolute top-2 left-0 h-px w-5 bg-current transition-opacity duration-200 ${
                  isMobileMenuOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute top-4 left-0 h-px w-5 bg-current transition-transform duration-200 ${
                  isMobileMenuOpen ? "-translate-y-2 -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        className={`absolute top-20 right-0 left-0 max-h-[calc(100vh-5rem)] overflow-y-auto bg-black px-4 pb-6 transition-all duration-200 sm:px-6 md:hidden ${
          isMobileMenuOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="mx-auto max-w-300 rounded-b-md pt-4">
          <MobileNav onNavigate={() => setIsMobileMenuOpen(false)} />

          <div className="mt-6 grid gap-3">
            <a
              href={links.mailto.contact}
              onClick={() => setIsMobileMenuOpen(false)}
              className="h-9 rounded-md border border-white/15 bg-black px-4 py-2 text-center font-semibold text-ink-body text-md transition-colors hover:bg-white/10 hover:text-ink-strong"
            >
              {messages.common.actions.talkToSales}
            </a>
            <Link
              href="/pricing"
              onClick={() => setIsMobileMenuOpen(false)}
              className="h-9 rounded-md bg-[#dedede] px-4 py-2 text-center font-semibold text-[#151515] text-md transition-colors hover:bg-white"
            >
              {messages.common.actions.tryForFree}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
