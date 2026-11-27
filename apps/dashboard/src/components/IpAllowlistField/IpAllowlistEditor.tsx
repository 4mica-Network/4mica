import { Button, Modal } from "@4mica/ui";
import {
  allowlistError,
  formatAllowlist,
  parseAllowlist,
} from "@utils/ipAllowlist";
import { Network } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IpAllowlistField } from "./index";

export function IpAllowlistEditor({
  id,
  keyName,
  value,
  disabled,
  onSave,
}: {
  id: string;
  keyName: string;
  value: string[] | undefined;
  disabled?: boolean;
  onSave: (entries: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const entries = parseAllowlist(draft);
  const error = allowlistError(entries, t);

  return (
    <>
      <Button
        type="button"
        size="sm"
        intent="ghost"
        className="btn-no-lift px-2"
        aria-label={t("ipAllowlist.edit", { name: keyName })}
        disabled={disabled}
        onClick={() => {
          setDraft(formatAllowlist(value ?? []));
          setOpen(true);
        }}
        data-testid={`${id}-open`}
      >
        <Network aria-hidden="true" className="h-4 w-4" />
      </Button>
      <Modal
        closeLabel={t("modal.close")}
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t("ipAllowlist.editTitle", { name: keyName })}
        size="sm"
        data-testid={`${id}-modal`}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button intent="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("confirm.cancel")}
            </Button>
            <Button
              intent="invert"
              size="sm"
              className="btn-no-lift min-w-20 text-sm"
              disabled={Boolean(error)}
              onClick={() => {
                onSave(entries);
                setOpen(false);
              }}
              data-testid={`${id}-save`}
            >
              {t("ipAllowlist.save")}
            </Button>
          </div>
        }
      >
        <IpAllowlistField
          id={`${id}-input`}
          value={draft}
          onChange={setDraft}
        />
      </Modal>
    </>
  );
}
