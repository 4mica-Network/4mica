import { Asterisk, ChevronDown } from "lucide-react";
import {
  type KeyboardEvent,
  type Ref,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/cn";
import { isOpenKey, joinIds, mergeRefs } from "../../lib/focusable";
import { Dropdown } from "../dropdown";
import { InputField } from "../input-field";
import { Spinner } from "../spinner";

export type Option = {
  title: string;
  value: string | number;
  checked?: boolean;
};

export type SelectProps = {
  id?: string;
  ref?: Ref<HTMLButtonElement>;
  label?: string;
  searchPlaceholder?: string;
  noDataText?: string;
  noResultsText?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  options: Option[];
  value?: string | number;
  initialValue?: Option;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  visible?: boolean;
  isInputHidden?: boolean;
  placeholder?: string;
  hasEmptyValue?: boolean;
  hasSearch?: boolean;
  required?: boolean;
  error?: string;
  onChange: (value: Option | null) => void;
  onToggle?: (value: boolean) => void;
  onSearch?: (term: string) => void;
  "data-testid"?: string;
};

export const Select = ({
  id,
  ref,
  options = [],
  value,
  initialValue,
  className,
  disabled = false,
  loading = false,
  label,
  visible,
  isInputHidden = false,
  hasEmptyValue = false,
  hasSearch = false,
  required,
  error,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  noDataText = "No Data",
  noResultsText = "No matching results",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  onChange,
  onToggle,
  onSearch,
  ...props
}: SelectProps) => {
  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-select`
    : "select";

  const [searchTerm, setSearchTerm] = useState("");
  const [internalValue, setInternalValue] = useState<Option | null>(null);
  const [internalVisible, setInternalVisible] = useState(false);

  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const generatedId = useId();
  const triggerId = id ?? `select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const errorId = error ? `${triggerId}-error` : undefined;
  const describedBy = joinIds(ariaDescribedBy, errorId);

  const isOpen = visible ?? internalVisible;

  const setOpen = (next: boolean) => {
    if (visible === undefined) {
      setInternalVisible(next);
    }
    onToggle?.(next);
  };

  useEffect(() => {
    if (initialValue && value === undefined) {
      setInternalValue(initialValue);
    }
  }, [initialValue, value]);

  const selected = useMemo(() => {
    if (value !== undefined) {
      return options.find((op) => op.value === value) ?? null;
    }
    return internalValue;
  }, [value, internalValue, options]);

  const filteredOptions = useMemo(
    () =>
      options.filter((opt) =>
        opt.title.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [options, searchTerm],
  );

  useEffect(() => {
    if (!isOpen && hasSearch) {
      setSearchTerm("");
    }
  }, [isOpen, hasSearch]);

  const handleChange = (option: Option | null) => {
    if (value === undefined) {
      setInternalValue(option);
    }
    onChange?.(option);
    setOpen(false);
  };

  const displayLabel = selected?.title ?? placeholder;

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isOpenKey(event.key)) {
      event.preventDefault();
      if (!disabled) setOpen(true);
    }
  };

  return (
    <div className="relative w-full" data-testid={prefix}>
      {label && (
        <label
          htmlFor={triggerId}
          className="mb-2.5 flex select-none items-center gap-1 font-medium text-ink-muted text-sm"
          data-testid={`${prefix}-label`}
        >
          <span className="leading-none">{label}</span>
          {required && (
            <Asterisk className="h-2 w-2 text-danger" aria-hidden="true" />
          )}
        </label>
      )}

      {!isInputHidden && (
        <button
          ref={mergeRefs(anchorRef, ref)}
          id={triggerId}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onClick={() => !disabled && setOpen(!isOpen)}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border border-overlay/15 px-3 py-2.5 text-left text-ink-body text-sm outline-none transition",
            disabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:border-overlay/30 focus-visible:border-overlay/50 focus-visible:ring-1 focus-visible:ring-overlay/40",
            error && "border-danger",
            className,
          )}
          data-testid={`${prefix}-trigger`}
        >
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            <span
              className={selected ? "text-ink-body" : "text-ink-subtle"}
              data-testid={`${prefix}-selected`}
            >
              {displayLabel}
            </span>
          </span>
          <span
            className="ml-2 flex h-4 w-4 items-center justify-center"
            data-testid={`${prefix}-icon`}
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 text-ink-subtle transition-transform duration-300",
                isOpen ? "-rotate-180" : "rotate-0",
              )}
            />
          </span>
        </button>
      )}

      {!disabled && (
        <Dropdown
          isOpen={isOpen}
          anchorRef={anchorRef}
          placement="bottom"
          onClickOutside={() => setOpen(false)}
          autoFocus
          matchAnchorWidth
          className="p-0"
          data-testid={prefix}
        >
          {loading ? (
            <div
              className="flex min-h-30 items-center justify-center p-2"
              data-testid={`${prefix}-loading`}
            >
              <Spinner size="lg" className="text-ink-body" />
            </div>
          ) : (
            <div
              className="max-h-62.5 w-full overflow-y-auto p-2 text-sm"
              data-testid={`${prefix}-list`}
            >
              {hasSearch && (
                <div className="mb-2">
                  <InputField
                    type="search"
                    aria-label={searchPlaceholder}
                    aria-controls={listboxId}
                    placeholder={searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      onSearch?.(e.target.value);
                    }}
                    data-testid={`${prefix}-search`}
                  />
                </div>
              )}

              <div
                id={listboxId}
                role="listbox"
                aria-labelledby={label ? triggerId : undefined}
                aria-label={label ? undefined : (ariaLabel ?? placeholder)}
              >
                {hasEmptyValue && selected && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="block w-full cursor-pointer rounded-md px-4 py-2 text-left text-ink-body hover:bg-overlay/10 focus-visible:bg-overlay/10 focus-visible:outline-none"
                    onClick={() => handleChange(null)}
                    data-testid={`${prefix}-clear`}
                  >
                    -
                  </button>
                )}

                {options.length === 0 ? (
                  <div
                    className="py-2 text-center text-ink-muted italic"
                    data-testid={`${prefix}-no-data`}
                  >
                    {noDataText}
                  </div>
                ) : filteredOptions.length > 0 ? (
                  filteredOptions.map((opt, i) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={opt.value === selected?.value}
                      title={opt.title}
                      className={cn(
                        "block w-full cursor-pointer rounded-md px-4 py-2 text-left text-ink-body hover:bg-overlay/10 focus-visible:bg-overlay/10 focus-visible:outline-none",
                        opt.value === selected?.value && "bg-overlay/5",
                      )}
                      onClick={() => handleChange(opt)}
                      data-testid={`${prefix}-option-${i}`}
                    >
                      {opt.title}
                    </button>
                  ))
                ) : (
                  <div
                    className="py-2 text-center text-ink-muted italic"
                    data-testid={`${prefix}-no-results`}
                  >
                    {noResultsText}
                  </div>
                )}
              </div>
            </div>
          )}
        </Dropdown>
      )}

      {error && (
        <p
          id={errorId}
          aria-live="polite"
          className="mt-2 select-none font-normal text-danger text-xs"
          data-testid={`${prefix}-error`}
        >
          {error}
        </p>
      )}
    </div>
  );
};

Select.displayName = "Select";
