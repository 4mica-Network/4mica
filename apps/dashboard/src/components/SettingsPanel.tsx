import { useTitle } from "ahooks";
import { ORG_NAME } from "../pages";

export function SettingsPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  useTitle(`${title} - ${ORG_NAME}`);
  return (
    <section>
      <h2 className="font-semibold text-ink-strong text-lg">{title}</h2>
      <p className="mt-1 text-ink-muted text-sm">{description}</p>
    </section>
  );
}
