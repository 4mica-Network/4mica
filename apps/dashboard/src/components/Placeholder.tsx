import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./ui";

/**
 * A page that exists in the app shell but has no content yet — just its title
 * and description. Real content lands later. `icon` is accepted for call-site
 * compatibility but not rendered.
 */
export function Placeholder({
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return <PageHeader title={title} subtitle={description} />;
}
