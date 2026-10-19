"use client";

import { links } from "@4mica/url";
import { motion, type Variants } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { PARTNERS } from "../data";
import SilkTower from "./SilkTower";

const MARQUEE_ITEMS = [...PARTNERS, ...PARTNERS];

const arrowNudge: Variants = {
  rest: { x: 0 },
  hover: {
    x: 4,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function TeamsSection() {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SilkTower className="mx-auto mb-8 h-44 w-90 text-overlay" />

        <div className="mx-auto max-w-2xl text-center">
          <p className="section-kicker">Customers</p>
          <h2 className="section-title mt-2 font-normal">
            Teams building on 4Mica
          </h2>
          <p className="section-lead mx-auto mt-1 max-w-xl">
            Trusted by fast-growing companies around the world.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <motion.div className="flex" initial="rest" whileHover="hover">
            <Link
              href="/pricing"
              className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-ink-strong px-4 py-2 font-semibold text-md text-surface-deep transition-colors duration-200 hover:bg-ink-strong/90"
            >
              Get started
              <motion.span
                aria-hidden="true"
                className="inline-flex"
                variants={arrowNudge}
              >
                <i className="ri-arrow-right-line text-lg leading-none" />
              </motion.span>
            </Link>
          </motion.div>

          <Link
            href={links.social.githubCore}
            target="_blank"
            rel="noreferrer"
            className="btn btn-soft btn-lg inline-flex h-10 items-center justify-center gap-1.5"
          >
            <i className="ri-github-fill" />
            View on GitHub
          </Link>
        </div>

        <div className="mt-14">
          <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <div className="flex w-max shrink-0 animate-[marquee_48s_linear_infinite] items-center hover:[animation-play-state:paused] motion-reduce:[animation-play-state:paused]">
              {[0, 1].map((copy) =>
                MARQUEE_ITEMS.map((partner, index) => (
                  <Link
                    key={`${copy}-${index}-${partner.name}`}
                    href={partner.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-hidden={copy === 1 || undefined}
                    tabIndex={copy === 1 ? -1 : undefined}
                    className="flex shrink-0 items-center justify-center rounded-md px-8 py-3 transition-all duration-300"
                    aria-label={`${partner.name} homepage`}
                  >
                    <Image
                      src={partner.logo}
                      alt={`${partner.name} logo`}
                      width={160}
                      height={48}
                      className={`max-h-10 w-auto object-contain grayscale filter transition-all duration-300 hover:grayscale-0 ${
                        "invertOnLight" in partner && partner.invertOnLight
                          ? "invert dark:invert-0"
                          : ""
                      } ${
                        "invertOnDark" in partner && partner.invertOnDark
                          ? "dark:invert"
                          : ""
                      }`}
                    />
                  </Link>
                )),
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
