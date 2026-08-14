import { Link as UiLink } from "@4mica/ui";
import { messages } from "@/i18n";
import { links } from "@/services/links";

export function ProfileFooter({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }

  return (
    <footer className="mt-8 flex justify-center">
      <UiLink href={links.website} variant="muted" external className="text-sm">
        {messages.common.poweredBy}
      </UiLink>
    </footer>
  );
}
