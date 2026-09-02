"use client";

import Image from "next/image";
import { type MouseEvent as ReactMouseEvent, useRef } from "react";
import { teamMembers } from "./data";

type Member = (typeof teamMembers)[number];

function TeamMemberCard({ member }: { member: Member }) {
  const spotRef = useRef<HTMLDivElement | null>(null);

  const handleMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const el = spotRef.current;
    if (!el) return;
    const rect = event.currentTarget.getBoundingClientRect();
    el.style.setProperty(
      "--spot-x",
      `${((event.clientX - rect.left) / rect.width) * 100}%`,
    );
    el.style.setProperty(
      "--spot-y",
      `${((event.clientY - rect.top) / rect.height) * 100}%`,
    );
    el.style.opacity = "1";
  };

  const handleLeave = () => {
    const el = spotRef.current;
    if (el) el.style.opacity = "0";
  };

  return (
    <div className="flex w-36 flex-col items-center text-center sm:w-44">
      <div className="relative">
        <div
          className="pointer-events-none absolute -inset-5 -z-10 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover/card:opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.22), rgba(255,255,255,0))",
          }}
        />
        {/* biome-ignore lint/a11y/noStaticElementInteractions: cursor-tracking spotlight is a decorative visual enhancement with no keyboard equivalent. */}
        <div
          className="group/card relative h-48 w-36 overflow-hidden rounded-full border border-overlay/10 bg-surface sm:h-60 sm:w-44"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        >
          <Image
            src={member.image}
            alt={`${member.name}, ${member.role} at 4Mica`}
            fill
            sizes="(min-width: 640px) 176px, 144px"
            quality={100}
            className="object-cover grayscale transition duration-500 ease-out group-hover/card:grayscale-0"
            style={{ objectPosition: member.imagePosition ?? "50% 20%" }}
          />
          <div
            ref={spotRef}
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: 0,
              mixBlendMode: "soft-light",
              background:
                "radial-gradient(circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.6), rgba(255,255,255,0) 55%)",
            }}
          />
        </div>
      </div>

      <h2 className="mt-5 font-semibold text-ink-strong text-lg">
        {member.name}
      </h2>
      <p className="mt-1 text-ink-muted text-md">{member.role}</p>
    </div>
  );
}

export default function TeamGrid() {
  return (
    <div className="mt-16 flex flex-wrap items-start justify-center gap-x-6 gap-y-10 sm:gap-x-10 sm:gap-y-12">
      {teamMembers.map((member) => (
        <TeamMemberCard key={member.name} member={member} />
      ))}
    </div>
  );
}
