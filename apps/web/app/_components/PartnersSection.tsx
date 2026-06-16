"use client";

import { links, routes } from "@4mica/url";
import Image from "next/image";
import Link from "next/link";
import { PARTNERS, PRIMITIVES, TRUST_POINTS } from "../data";

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

        <div className="mb-16 w-full overflow-hidden rounded-md border border-white/10 bg-black/25">
          <div className="grid grid-cols-1 md:grid-cols-3">
            {PRIMITIVES.map((p, index) => {
              const hoverRadius =
                index === 0
                  ? "rounded-t-md md:rounded-tr-none"
                  : index === PRIMITIVES.length - 1
                    ? "md:rounded-tr-md"
                    : "";

              return (
                <div
                  key={p.name}
                  className="group relative flex min-w-0 flex-col gap-4 border-white/10 border-b p-6 transition-colors duration-500 hover:bg-white/[0.018] md:border-r md:last:border-r-0"
                >
                  <div
                    className={`pointer-events-none absolute inset-0 z-20 border border-white/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${hoverRadius}`}
                  />
                  <div
                    className={`pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${hoverRadius}`}
                    style={{
                      padding: "1px",
                      background:
                        "linear-gradient(115deg, rgba(255,255,255,0), rgba(255,255,255,0.32), rgba(255,255,255,0.04), rgba(255,255,255,0))",
                      mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                      maskComposite: "exclude",
                      WebkitMask:
                        "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                      WebkitMaskComposite: "xor",
                    }}
                  />
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white/[0.035] text-ink-strong ring-1 ring-white/10 transition-colors duration-500 group-hover:bg-white/[0.06] group-hover:ring-white/15">
                    <i className={`${p.icon} text-3xl`} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-ink-strong text-xl">
                        {p.name}
                      </span>
                      <span className="font-medium text-ink-muted text-md uppercase tracking-widest transition-colors duration-500 group-hover:text-ink-body">
                        {p.role}
                      </span>
                    </div>
                    <p className="mt-2 text-ink-muted text-md leading-relaxed transition-colors duration-500 group-hover:text-ink-body">
                      {p.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust points */}
          <div className="grid w-full grid-cols-1 sm:grid-cols-3">
            {TRUST_POINTS.map((t) => (
              <div
                key={t.label}
                className="flex min-w-0 items-start gap-4 border-white/10 border-b p-6 transition-colors duration-500 last:border-b-0 hover:bg-white/[0.018] sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/[0.035] text-ink-strong ring-1 ring-white/10">
                  <i className={`${t.icon} text-2xl`} />
                </div>
                <div>
                  <p className="font-medium text-ink-strong text-xl">
                    {t.label}
                  </p>
                  <p className="mt-1.5 text-ink-muted text-md leading-relaxed">
                    {t.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Partner logos */}
          <div className="border-white/10 border-t px-6 py-8 text-left sm:px-8">
            <p className="mb-6 font-medium text-ink-strong text-xl">
              Teams building on 4Mica
            </p>
            <div className="flex w-full flex-wrap items-center gap-4">
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
