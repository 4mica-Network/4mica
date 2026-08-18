import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { Checkbox } from "../checkbox";
import { Dropdown } from "../dropdown";
import { InputField } from "../input-field";

export type ComboBoxOption = {
  title: string;
  value: string | number;
};

export type ComboBoxProps = {
  label?: string;
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
  label,
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
        <p className="mb-2 font-medium text-ink-muted text-sm">{label}</p>
      )}

      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={visible}
        disabled={disabled}
        onClick={() => !disabled && setVisible(!visible)}
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
            ? `${selectedValues.length} selected`
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
        matchAnchorWidth
        className="p-0"
      >
        <div
          className="flex flex-col gap-2.5 p-2.5 text-sm"
          {...(dataTestId ? { "data-testid": `${dataTestId}-panel` } : {})}
        >
          <InputField
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            {...(dataTestId ? { "data-testid": `${dataTestId}-search` } : {})}
          />

          <div
            className="flex max-h-50 flex-col overflow-y-auto overflow-x-hidden"
            role="listbox"
            aria-multiselectable
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
                No results
              </div>
            )}
          </div>
        </div>
      </Dropdown>
    </div>
  );
};

ComboBox.displayName = "ComboBox";
