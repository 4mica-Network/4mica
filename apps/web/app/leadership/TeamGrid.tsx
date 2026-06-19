"use client";

import Image from "next/image";
import { type MouseEvent as ReactMouseEvent, useState } from "react";
import { teamMembers } from "./data";

type Member = (typeof teamMembers)[number];

function TeamMemberCard({ member }: { member: Member }) {
  const [spot, setSpot] = useState({ x: 50, y: 50, active: false });

  const handleMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setSpot({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      active: true,
    });
  };

  return (
    <div className="flex w-44 flex-col items-center text-center">
      {/* Capsule image with spotlight */}
      <div className="relative">
        {/* Ambient glow behind the capsule */}
        <div
          className="pointer-events-none absolute -inset-5 -z-10 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover/card:opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.22), rgba(255,255,255,0))",
          }}
        />
        {/* biome-ignore lint/a11y/noStaticElementInteractions: cursor-tracking spotlight is a decorative visual enhancement with no keyboard equivalent. */}
        <div
          className="group/card relative h-60 w-44 overflow-hidden rounded-full border border-white/10 bg-[#0a0a0a]"
          onMouseMove={handleMove}
          onMouseLeave={() => setSpot((s) => ({ ...s, active: false }))}
        >
          <Image
            src={member.image}
            alt={member.name}
            fill
            sizes="176px"
            quality={100}
            className="object-cover grayscale transition duration-500 ease-out group-hover/card:grayscale-0"
            style={{ objectPosition: member.imagePosition ?? "50% 20%" }}
          />
          {/* Cursor-following spotlight */}
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: spot.active ? 1 : 0,
              mixBlendMode: "soft-light",
              background: `radial-gradient(circle at ${spot.x}% ${spot.y}%, rgba(255,255,255,0.6), rgba(255,255,255,0) 55%)`,
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
    <div className="mt-16 flex flex-wrap items-start justify-center gap-x-10 gap-y-12">
      {teamMembers.map((member) => (
        <TeamMemberCard key={member.name} member={member} />
      ))}
    </div>
  );
}
