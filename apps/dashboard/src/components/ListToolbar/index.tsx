import { cn, InputField, type Option, Select, Spinner } from "@4mica/ui";
import { useDebounceEffect } from "ahooks";
import { Search as SearchIcon, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function Root({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="@container">
      <div
        className={cn(
          "flex @5xl:flex-row flex-col @5xl:items-start gap-3",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Search({
  value,
  placeholder,
  onSearch,
  "data-testid": testId,
}: {
  value: string;
  placeholder: string;
  onSearch: (term: string) => void;
  "data-testid"?: string;
}) {
  const [term, setTerm] = useState(value);

  useEffect(() => {
    setTerm(value);
  }, [value]);

  useDebounceEffect(
    () => {
      if (term !== value) {
        onSearch(term);
      }
    },
    [term],
    { wait: 450 },
  );

  return (
    <div className="@5xl:w-72 w-full min-w-0 @5xl:shrink-0">
      <InputField
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        icon={
          <SearchIcon aria-hidden="true" className="h-4 w-4 text-ink-subtle" />
        }
        maxLength={100}
        data-testid={testId}
      />
    </div>
  );
}

function Filters({
  children,
  overlay,
}: {
  children: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <div
        className={cn(
          "grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3",
          overlay && "invisible",
        )}
        inert={Boolean(overlay)}
      >
        {children}
      </div>
      {overlay && <div className="absolute inset-x-0 top-0">{overlay}</div>}
    </div>
  );
}

function Filter<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  "data-testid": testId,
}: {
  label: string;
  value: T;
  options: Option[];
  onChange: (value: T) => void;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Select
        aria-label={label}
        value={value}
        options={options}
        onChange={(option) => onChange(String(option?.value ?? "") as T)}
        data-testid={testId}
      />
    </div>
  );
}

function SelectionBar({
  ns,
  count,
  allSelected,
  isDeleting,
  onToggleAll,
  onBatchDelete,
  testIdPrefix,
}: {
  ns: string;
  count: number;
  allSelected: boolean;
  isDeleting: boolean;
  onToggleAll: () => void;
  onBatchDelete: () => void;
  testIdPrefix: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-10.5 items-center justify-between gap-3 rounded-lg border border-overlay/10 bg-overlay/5 py-1.5 pr-1.5 pl-4"
      data-testid={`${testIdPrefix}-selection-bar`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-live="polite" className="text-ink-body text-sm">
          {t(`${ns}.toolbar.selected`, { count })}
        </span>
        <button
          type="button"
          className="rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
          onClick={onToggleAll}
        >
          {allSelected
            ? t(`${ns}.toolbar.clearSelection`)
            : t(`${ns}.toolbar.selectAll`)}
        </button>
      </div>

      <button
        type="button"
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-ink-muted text-xs transition-colors hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-50"
        disabled={isDeleting}
        aria-busy={isDeleting}
        onClick={onBatchDelete}
        data-testid={`${testIdPrefix}-batch-delete`}
      >
        {isDeleting ? (
          <Spinner size="sm" />
        ) : (
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        {t(`${ns}.toolbar.deleteSelected`)}
      </button>
    </div>
  );
}

export const ListToolbar = Object.assign(Root, {
  Search,
  Filters,
  Filter,
  SelectionBar,
});
