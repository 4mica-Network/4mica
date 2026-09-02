import ViewOpenRolesButton from "@components/ViewOpenRolesButton";
import { messages } from "@/i18n";

export default function OpenRolesSection() {
  return (
    <section className="relative isolate mt-24 w-full overflow-hidden rounded-xl py-24">
      <div className="wave-rings pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-20 bg-linear-to-r from-surface-deep to-transparent sm:w-48" />
      <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-20 bg-linear-to-l from-surface-deep to-transparent sm:w-48" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-linear-to-b from-surface-deep to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-linear-to-t from-surface-deep to-transparent" />

      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <h2 className="block max-w-3xl font-normal text-3xl text-ink-strong tracking-tight">
          {messages.team.openRolesTitle}
        </h2>
        <div className="mt-6">
          <ViewOpenRolesButton />
        </div>
      </div>
    </section>
  );
}
