import Image from "next/image";
import { messages } from "@/i18n";
import { links } from "@/services/links";

export function ProfileFooter({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }

  return (
    <footer className="mt-auto hidden items-center justify-center gap-1.5 text-ink-muted text-xs md:flex">
      {messages.common.poweredBy}
      <a
        className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:text-ink-strong focus-visible:text-ink-strong"
        href={links.website}
        rel="noreferrer noopener"
        target="_blank"
      >
        <Image
          alt=""
          className="h-5 w-auto opacity-60 brightness-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:invert"
          height={20}
          src="/icon.png"
          width={28}
        />
        <span className="font-medium">{messages.common.brandName}</span>
      </a>
    </footer>
  );
}
