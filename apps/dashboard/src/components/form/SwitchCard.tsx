import { Card, Switch } from "@4mica/ui";
import { useId } from "react";
import { SavingIndicator } from "@/components/layout";

export function SwitchCard({
  id,
  title,
  description,
  note,
  checked,
  onToggle,
  disabled,
  isSaving,
}: {
  id: string;
  title: string;
  description?: string;
  note?: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  isSaving?: boolean;
}) {
  const descriptionId = useId();
  return (
    <Card className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <span className="font-medium text-ink-strong text-sm">{title}</span>
        {description && (
          <p id={descriptionId} className="mt-0.5 text-ink-muted text-xs">
            {description}
          </p>
        )}
        {note && <p className="mt-1.5 text-ink-muted text-xs">{note}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex h-4 w-4 items-center justify-center">
          {isSaving && <SavingIndicator />}
        </span>
        <Switch
          data-testid={id}
          aria-label={title}
          aria-describedby={description ? descriptionId : undefined}
          initialState={checked}
          onToggle={onToggle}
          disabled={disabled}
        />
      </div>
    </Card>
  );
}
