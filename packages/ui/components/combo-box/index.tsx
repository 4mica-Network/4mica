import { ChevronDown } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { isOpenKey } from "../../lib/focusable";
import { Checkbox } from "../checkbox";
import { Dropdown } from "../dropdown";
import { InputField } from "../input-field";

export type ComboBoxOption = {
  title: string;
  value: string | number;
};

export type ComboBoxProps = {
  id?: string;
  label?: string;
  selectedText?: (count: number) => string;
  noResultsText?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  options: ComboBoxOption[];
  selectedValues: Array<string | number>;
  onChange: (selected: Array<string | number>) => void;
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  "data-testid"?: string;
};

export const ComboBox = ({
  id,
  label,
  selectedText = (count) => `${count} selected`,
  noResultsText = "No results",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  options,
  selectedValues,
  onChange,
  className,
  placeholder = "Select options",
  searchPlaceholder = "Search...",
  disabled = false,
  "data-testid": dataTestId,
}: ComboBoxProps) => {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const generatedId = useId();
  const triggerId = id ?? `combo-${generatedId}`;
  const panelId = `${triggerId}-panel`;

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isOpenKey(event.key)) {
      event.preventDefault();
      if (!disabled) setVisible(true);
    }
  };

  const filteredOptions = useMemo(
    () =>
      options.filter((opt) =>
        opt.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [options, search],
  );

  const toggleValue = (val: string | number) => {
    onChange(
      selectedValues.includes(val)
        ? selectedValues.filter((v) => v !== val)
        : [...selectedValues, val],
    );
  };

  return (
    <div
      className="relative w-full"
      {...(dataTestId ? { "data-testid": `${dataTestId}-root` } : {})}
    >
      {label && (
        <label
          htmlFor={triggerId}
          className="mb-2 block font-medium text-ink-muted text-sm"
        >
          {label}
        </label>
      )}

      <button
        ref={anchorRef}
        id={triggerId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={visible}
        aria-controls={visible ? panelId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => !disabled && setVisible(!visible)}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "flex w-full items-center rounded-lg border border-overlay/15 px-3 py-2.5 text-left text-ink-body text-sm outline-none transition",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-overlay/30 focus-visible:border-overlay/50 focus-visible:ring-1 focus-visible:ring-overlay/40",
          visible && "border-overlay/50 ring-1 ring-overlay/40",
          className,
        )}
        {...(dataTestId ? { "data-testid": `${dataTestId}-trigger` } : {})}
      >
        <span
          className={cn(
            "flex-1 select-none overflow-hidden text-ellipsis whitespace-nowrap",
            selectedValues.length > 0 ? "text-ink-body" : "text-ink-subtle",
          )}
        >
          {selectedValues.length > 0
            ? selectedText(selectedValues.length)
            : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-ink-subtle transition-transform duration-300",
            visible ? "-rotate-180" : "rotate-0",
          )}
        />
      </button>

      <Dropdown
        isOpen={visible}
        anchorRef={anchorRef}
        placement="bottom"
        onClickOutside={() => setVisible(false)}
        autoFocus
        id={panelId}
        matchAnchorWidth
        className="p-0"
      >
        <div
          className="flex flex-col gap-2.5 p-2.5 text-sm"
          {...(dataTestId ? { "data-testid": `${dataTestId}-panel` } : {})}
        >
          <InputField
            type="search"
            aria-label={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            {...(dataTestId ? { "data-testid": `${dataTestId}-search` } : {})}
          />

          <fieldset
            className="m-0 flex max-h-50 min-w-0 flex-col overflow-y-auto overflow-x-hidden border-0 p-0"
            aria-labelledby={triggerId}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <Checkbox
                  key={opt.value}
                  checked={selectedValues.includes(opt.value)}
                  onChange={() => toggleValue(opt.value)}
                  variant="square"
                  className="w-full select-none rounded-lg px-3 py-2 hover:bg-overlay/10"
                  labelClassName="min-w-0 flex-1 truncate"
                  {...(dataTestId
                    ? {
                        "data-testid": `${dataTestId}-option-${String(opt.value)}`,
                      }
                    : {})}
                >
                  {opt.title}
                </Checkbox>
              ))
            ) : (
              <div
                className="py-2 text-center text-ink-muted text-sm italic"
                {...(dataTestId
                  ? { "data-testid": `${dataTestId}-no-results` }
                  : {})}
              >
                {noResultsText}
              </div>
            )}
          </fieldset>
        </div>
      </Dropdown>
    </div>
  );
};

ComboBox.displayName = "ComboBox";
