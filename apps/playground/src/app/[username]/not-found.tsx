import { Button } from "@4mica/ui";
import { messages } from "@/i18n";
import { links } from "@/services/links";

export default function ProfileNotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-6 text-center">
      <h1 className="font-semibold text-2xl text-ink-strong">
        {messages.errors.notFoundTitle}
      </h1>
      <p className="text-ink-muted">{messages.errors.profileNotFoundLead}</p>
      <div className="flex justify-center gap-3">
        <Button size="sm" asChild>
          <a href="/sign-up">{messages.errors.profileNotFoundAction}</a>
        </Button>
        <Button intent="ghost" size="sm" asChild>
          <a href={links.website}>{messages.errors.home}</a>
        </Button>
      </div>
    </main>
  );
}
