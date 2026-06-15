"use client";

import { links, routes } from "@4mica/url";
import Image from "next/image";
import Link from "next/link";
import { PARTNERS, PRIMITIVES, TRUST_POINTS } from "../data";

const BLUE = "#7bcbff";

export default function PartnersSection() {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        {/* Ecosystem primitives */}
        <div className="mb-12 text-center">
          <p className="section-kicker">Ecosystem</p>
          <h2 className="section-title">
            Built on primitives you already trust
          </h2>
          <p className="section-lead mx-auto max-w-xl">
            4Mica is not a new protocol stack. It is a credit layer on top of
            production infrastructure.
          </p>
        </div>

        <div className="mb-16 grid w-full grid-cols-1 gap-5 md:grid-cols-3">
          {PRIMITIVES.map((p) => (
            <div
              key={p.name}
              className="glass-panel flex min-w-0 flex-col gap-3 rounded-md p-6"
              style={{ borderColor: `${BLUE}28` }}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                style={{ background: `${BLUE}1a` }}
              >
                <i className={`${p.icon} text-lg`} style={{ color: BLUE }} />
              </div>
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-bold text-ink-strong text-sm">
                    {p.name}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: `${BLUE}bb` }}
                  >
                    {p.role}
                  </span>
                </div>
                <p className="mt-1.5 text-ink-muted text-xs leading-relaxed">
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mb-16 border-white/10 border-t" />

        {/* Trust points */}
        <div className="mb-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {TRUST_POINTS.map((t) => (
            <div key={t.label} className="flex min-w-0 items-start gap-3">
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                style={{ background: "rgb(var(--brand) / 0.16)" }}
              >
                <i
                  className={`${t.icon} text-sm`}
                  style={{ color: "rgb(var(--brand))" }}
                />
              </div>
              <div>
                <p className="font-semibold text-ink-strong text-sm">
                  {t.label}
                </p>
                <p className="mt-0.5 text-ink-muted text-xs">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Partner logos */}
        <div className="mb-8 text-center">
          <p className="mb-6 text-ink-subtle text-xs uppercase tracking-widest">
            Teams building on 4Mica
          </p>
          <div className="flex w-full flex-wrap items-center justify-center gap-6">
            {PARTNERS.map((partner) => (
              <Link
                key={partner.name}
                href={partner.href}
                target="_blank"
                rel="noreferrer"
                className="glass-panel flex items-center justify-center rounded-md p-3 transition-all duration-300 hover:border-brand/30"
                aria-label={`${partner.name} homepage`}
              >
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  width={160}
                  height={48}
                  className="max-h-12 w-auto object-contain grayscale filter transition-all duration-300 hover:grayscale-0"
                />
              </Link>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href={routes.technicalDocs}
            className="btn btn-primary btn-lg text-center"
          >
            Start Building
          </Link>
          <Link
            href={links.social.githubCore}
            target="_blank"
            rel="noreferrer"
            className="btn btn-soft btn-lg text-center"
          >
            <i className="ri-github-fill" />
            View on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}
