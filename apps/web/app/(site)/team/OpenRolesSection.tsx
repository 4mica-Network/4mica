import ViewOpenRolesButton from "@components/ViewOpenRolesButton";
import { messages } from "@/i18n";

// Concentric rings that fade out on all four edges, so the pattern dissolves
// into the page rather than ending on a hard line. The fades use surface-deep —
// the same token the page background uses — so they blend in both themes.
// `isolate` keeps the -z-10 layers inside this section's stacking context.
export default function OpenRolesSection() {
  return (
    <section className="relative isolate mt-24 w-full overflow-hidden rounded-xl px-2 py-24 lg:px-0">
      <div className="wave-rings pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-48 bg-gradient-to-r from-surface-deep to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-48 bg-gradient-to-l from-surface-deep to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-surface-deep to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-surface-deep to-transparent" />

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
