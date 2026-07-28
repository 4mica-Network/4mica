import Image from "next/image";
import type { CSSProperties } from "react";
import { messages } from "@/i18n";

const PHOTOS = messages.team.gallery;

// Per-tile tilt, by position. Presentation rather than copy, so it lives here
// and not in the message catalogue. Kept small and irregular — a uniform angle
// reads as a mistake, while these read as photos dropped on a table.
const TILTS = ["-2.5deg", "1.8deg", "-1.2deg", "2.4deg", "-1.9deg", "1.3deg"];

export default function PhotoCollage() {
  return (
    <div className="mt-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="section-kicker">{messages.team.galleryKicker}</p>
        <h2 className="section-title font-normal">
          {messages.team.galleryTitle}
        </h2>
        <p className="section-lead mx-auto max-w-2xl">
          {messages.team.galleryLead}
        </p>
      </div>

      {/* CSS multi-column keeps the masonry flow with no JS and no measuring, so
          this stays a server component. The uneven column heights are what give
          the wall its staggered look. */}
      <div className="photo-wall mx-auto mt-14 max-w-5xl gap-6 rounded-md px-4 py-8 sm:columns-2 sm:px-6 lg:columns-3">
        {PHOTOS.map((photo, index) => (
          <figure
            key={photo.src}
            style={{ "--tilt": TILTS[index % TILTS.length] } as CSSProperties}
            className="group/photo photo-tile relative mb-6 break-inside-avoid rounded-md border border-overlay/10 bg-surface-solid p-2 shadow-black/20 shadow-lg"
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="h-auto w-full rounded-sm grayscale transition duration-500 ease-out group-hover/photo:grayscale-0"
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
