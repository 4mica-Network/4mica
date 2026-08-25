import { Button } from "@4mica/ui";
import { messages } from "@/i18n";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-6 text-center">
      <h1 className="font-semibold text-2xl text-ink-strong">
        {messages.errors.notFoundTitle}
      </h1>
      <p className="text-ink-muted">{messages.errors.notFoundLead}</p>
      <div className="flex justify-center">
        <Button intent="outline" size="sm" asChild>
          <a href="/">{messages.errors.home}</a>
        </Button>
      </div>
    </main>
  );
}
