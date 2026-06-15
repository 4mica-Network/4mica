"use client";

import Image from "next/image";
import { teamMembers } from "./data";

export default function TeamSection() {
  return (
    <section id="team" className="section-gloss py-20">
      <div className="w-full">
        <div className="mb-16 text-center">
          <h2 className="section-title mb-6">Meet Our Team</h2>
          <div className="mx-auto mb-8 accent-bar"></div>
          <p className="section-lead mx-auto max-w-2xl">
            Leading experts in Cryptography, blockchain, and payment
            infrastructure
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <div
              key={member.name}
              className="glass-panel group overflow-hidden rounded-xl transition-shadow duration-300"
            >
              <div className="relative aspect-4/5 overflow-hidden bg-surface-solid/35">
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  style={{ objectPosition: member.imagePosition ?? "50% 20%" }}
                  quality={100}
                />
                <div className="absolute inset-0 bg-linear-to-t from-surface-deep/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
              </div>

              <div className="p-6">
                <h3 className="mb-2 font-bold text-ink-strong text-xl">
                  {member.name}
                </h3>
                <p className="mb-3 font-semibold text-brand">{member.role}</p>
                <p className="text-ink-body text-sm leading-relaxed">
                  {member.bio}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
