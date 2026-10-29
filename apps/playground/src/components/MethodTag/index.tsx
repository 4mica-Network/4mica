import { cn, Tag } from "@4mica/ui";
import type { HttpMethod } from "@/schema/params";

const METHOD_TONE: Record<HttpMethod, string> = {
  GET: "bg-success/15 text-success",
  POST: "bg-brand/15 text-brand",
  PUT: "bg-warning/15 text-warning",
  PATCH: "bg-brand-teal/15 text-brand-teal",
  DELETE: "bg-danger/15 text-danger",
};

export function MethodTag({ method }: { method: HttpMethod }) {
  return (
    <Tag
      className={cn("shrink-0 font-mono", METHOD_TONE[method])}
      size="sm"
      variant="neutral"
    >
      {method}
    </Tag>
  );
}
