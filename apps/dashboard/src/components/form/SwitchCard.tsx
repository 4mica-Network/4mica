import { Switch } from "@4mica/ui";
import { useId } from "react";
import { SavingIndicator, SurfaceCard } from "@/components/layout";

export function SwitchCard({
  id,
  title,
  description,
  checked,
  onToggle,
  disabled,
  isSaving,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  isSaving?: boolean;
}) {
  const descriptionId = useId();
  return (
    <SurfaceCard className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="font-medium text-ink-strong text-sm">{title}</span>
        {description && (
          <p id={descriptionId} className="mt-0.5 text-ink-muted text-xs">
            {description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isSaving && <SavingIndicator />}
        <Switch
          data-testid={id}
          aria-label={title}
          aria-describedby={description ? descriptionId : undefined}
          initialState={checked}
          onToggle={onToggle}
          disabled={disabled}
        />
      </div>
    </SurfaceCard>
  );
}
