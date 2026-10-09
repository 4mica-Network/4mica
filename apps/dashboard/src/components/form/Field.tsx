import { Asterisk } from "lucide-react";
import { createContext, type ReactNode, use, useId } from "react";

export interface FieldA11y {
  id?: string;
  describedBy?: string;
  required?: boolean;
}

const FieldContext = createContext<FieldA11y>({});

export const useFieldA11y = (): FieldA11y => use(FieldContext);

const joinIds = (...ids: (string | undefined)[]): string | undefined =>
  ids.filter(Boolean).join(" ") || undefined;

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="inline-flex items-center gap-1 font-medium text-ink-strong text-sm"
    >
      {children}
      {required && (
        <Asterisk aria-hidden="true" className="h-2 w-2 text-danger" />
      )}
    </label>
  );
}

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-0.5 text-ink-muted text-xs">
      {children}
    </p>
  );
}

const useFieldIds = (htmlFor: string | undefined) => {
  const generated = useId();
  const id = htmlFor ?? `field-${generated}`;
  return { id, hintId: `${id}-hint`, errorId: `${id}-row-error` };
};

export function FieldRow({
  title,
  description,
  htmlFor,
  required,
  action,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  required?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { id, hintId } = useFieldIds(htmlFor);
  const field: FieldA11y = {
    id,
    required,
    describedBy: description ? hintId : undefined,
  };

  return (
    <div className="flex flex-col py-3 first:pt-0 last:pb-0">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <FieldLabel htmlFor={id} required={required}>
            {title}
          </FieldLabel>
          {description && <Hint id={hintId}>{description}</Hint>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-2">
        <FieldContext value={field}>{children}</FieldContext>
      </div>
    </div>
  );
}

export function SettingRow({
  title,
  description,
  htmlFor,
  required,
  error,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  const { id, hintId, errorId } = useFieldIds(htmlFor);
  const field: FieldA11y = {
    id,
    required,
    describedBy: joinIds(
      description ? hintId : undefined,
      error ? errorId : undefined,
    ),
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:pr-6">
        <FieldLabel htmlFor={id} required={required}>
          {title}
        </FieldLabel>
        {description && <Hint id={hintId}>{description}</Hint>}
        {error && (
          <p
            id={errorId}
            aria-live="polite"
            className="mt-1 text-danger text-xs"
          >
            {error}
          </p>
        )}
      </div>
      <div className="w-full shrink-0 sm:w-64">
        <FieldContext value={field}>{children}</FieldContext>
      </div>
    </div>
  );
}
