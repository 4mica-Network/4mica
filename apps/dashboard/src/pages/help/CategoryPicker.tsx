import { cn } from "@4mica/ui";
import { useController } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useConfigList } from "@/hooks/useConfigOptions";
import {
  categoryDescriptionKey,
  categoryIcon,
  categoryLabelKey,
} from "./constants";

export function CategoryPicker() {
  const { t } = useTranslation();
  const categories = useConfigList("supportCategories");
  const { field, fieldState } = useController({ name: "category" });

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-3 text-ink-muted text-sm">
        {t("help.create.categoryPrompt")}
      </legend>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {categories.map((category) => {
          const Icon = categoryIcon(category);
          const isSelected = field.value === category;

          return (
            <label
              key={category}
              className={cn(
                "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-overlay/40",
                isSelected
                  ? "border-overlay/40 bg-overlay/10"
                  : "border-overlay/10 hover:border-overlay/20 hover:bg-overlay/5",
              )}
              data-testid={`help-category-${category}`}
            >
              <input
                type="radio"
                name={field.name}
                value={category}
                checked={isSelected}
                onChange={() => field.onChange(category)}
                onBlur={field.onBlur}
                aria-invalid={fieldState.error ? true : undefined}
                className="sr-only"
              />
              <Icon
                aria-hidden="true"
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  isSelected ? "text-ink-strong" : "text-ink-subtle",
                )}
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-ink-strong text-sm">
                  {t(categoryLabelKey(category))}
                </span>
                <span className="text-ink-muted text-xs">
                  {t(categoryDescriptionKey(category))}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {fieldState.error?.message && (
        <p aria-live="polite" className="text-danger text-xs">
          {t(fieldState.error.message)}
        </p>
      )}
    </fieldset>
  );
}
