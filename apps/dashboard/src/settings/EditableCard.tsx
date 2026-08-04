import { Button } from "@4mica/ui";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/form";

/** A card whose fields are typed, so changes are committed with a button. */
export function EditableCard({
  title,
  description,
  isDirty,
  isSaving,
  onSave,
  onReset,
  children,
}: {
  title: string;
  description?: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSave();
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader title={title} description={description} />
        <div className="mt-4">{children}</div>
        <div className="mt-5 flex items-center justify-end gap-2 border-overlay/10 border-t pt-4">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={onReset}
          >
            {t("settings.discard")}
          </Button>
          <Button type="submit" size="sm" disabled={!isDirty || isSaving}>
            {isSaving ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** A card of toggles and selects, each saved the moment it changes. */
export function InstantCard({
  title,
  description,
  isSaving,
  children,
}: {
  title: string;
  description?: string;
  isSaving: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} isSaving={isSaving} />
      <div className="mt-2">{children}</div>
    </Card>
  );
}
