import { Spinner } from "@/components/Spinner";

export function PageSpinner() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <Spinner size="lg" className="text-ink-subtle" />
    </div>
  );
}
