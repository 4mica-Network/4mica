import { cn } from "@4mica/ui";

export interface ProseProps {
  text: string | null;
  className?: string;
}

export function Prose({ text, className }: ProseProps) {
  if (!text?.trim()) {
    return null;
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 text-ink-body leading-relaxed",
        className,
      )}
    >
      {paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}
    </div>
  );
}
