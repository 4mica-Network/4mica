import { useTitle } from "ahooks";
import { ORG_NAME } from "../pages";

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  useTitle(`${title} - ${ORG_NAME}`);
  return (
    <div className="mb-6">
      <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-ink-muted text-sm">{subtitle}</p>}
    </div>
  );
}
