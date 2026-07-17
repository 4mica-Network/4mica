import Image from "next/image";
import { messages } from "@/i18n";

const PHOTOS = messages.team.gallery;

// CSS multi-column gives a real masonry flow with no JS and no measuring, which
// keeps this a server component. `break-inside-avoid` stops a photo splitting
// across a column boundary. Photos keep their natural aspect ratio — each one
// carries its own intrinsic width/height, so there is no layout shift on load.
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

      <div className="mt-12 gap-4 space-y-4 sm:columns-2 lg:columns-3">
        {PHOTOS.map((photo) => (
          <figure
            key={photo.src}
            className="group relative mb-4 break-inside-avoid overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25"
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="h-auto w-full transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
