import {
  Button,
  cn,
  InputField,
  type Option,
  Select,
  Spinner,
} from "@4mica/ui";
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
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center",
        className,
      )}
    >
      {children}
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
    <div className="min-w-0 sm:w-80">
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

function Filters({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

function Filter<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "sm:w-44",
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
    <div className={cn("w-full", className)}>
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
      className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-overlay/5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`${testIdPrefix}-selection-bar`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-live="polite"
          className="font-medium text-ink-strong text-sm"
        >
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

      <Button
        intent="ghost"
        size="sm"
        className="btn-no-lift shrink-0 self-start text-danger sm:self-auto"
        disabled={isDeleting}
        aria-busy={isDeleting}
        onClick={onBatchDelete}
        data-testid={`${testIdPrefix}-batch-delete`}
      >
        <span className="flex items-center gap-2 text-sm">
          {isDeleting ? (
            <Spinner size="sm" />
          ) : (
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          )}
          {t(`${ns}.toolbar.deleteSelected`)}
        </span>
      </Button>
    </div>
  );
}

export const ListToolbar = Object.assign(Root, {
  Search,
  Filters,
  Filter,
  SelectionBar,
});
