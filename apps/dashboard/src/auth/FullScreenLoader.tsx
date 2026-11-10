import { Spinner } from "@4mica/ui";

export function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-deep">
      <Spinner size="lg" className="text-ink-subtle" />
    </div>
  );
}
