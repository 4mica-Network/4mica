import { Button, Spinner } from "@4mica/ui";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/form";

export function EditableCard({
  title,
  description,
  isDirty,
  isSaving,
  isInvalid = false,
  onSave,
  onReset,
  children,
}: {
  title?: string;
  description?: string;
  isDirty: boolean;
  isSaving: boolean;
  isInvalid?: boolean;
  onSave: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isDirty || isSaving || isInvalid) {
      return;
    }
    onSave();
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        {title && (
          <div className="mb-4">
            <CardHeader title={title} description={description} />
          </div>
        )}

        {children}

        <div className="-mx-6 mt-5 flex items-center justify-end gap-2 border-overlay/10 border-t px-6 pt-4">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={onReset}
          >
            {t("settings.discard")}
          </Button>
          <Button
            type="submit"
            size="sm"
            intent="invert"
            className="btn-no-lift w-20"
            disabled={!isDirty || isSaving || isInvalid}
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isSaving ? <Spinner size="sm" /> : t("settings.update")}
            </span>
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function InstantCard({
  title,
  description,
  isSaving,
  children,
}: {
  title?: string;
  description?: string;
  isSaving: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      {title && (
        <div className="mb-4">
          <CardHeader
            title={title}
            description={description}
            isSaving={isSaving}
          />
        </div>
      )}
      {children}
    </Card>
  );
}
