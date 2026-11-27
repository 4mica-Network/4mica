import { Avatar, cn, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { switchOrganization } from "@stores/organization/actions";
import {
  selectActiveOrganizationId,
  selectOrganizations,
} from "@stores/organization/selector";
import { Check, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-ink-body text-sm outline-none hover:bg-overlay/10 focus-visible:bg-overlay/10 focus-visible:ring-1 focus-visible:ring-overlay/60 focus-visible:ring-inset";

export function OrganizationSwitcher({
  onDone,
  onCreate,
}: {
  onDone: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const organizations = useAppSelector(selectOrganizations);
  const activeId = useAppSelector(selectActiveOrganizationId);

  const choose = (id: string) => {
    onDone();
    if (id === activeId) {
      return;
    }
    navigate("/");
    dispatch(switchOrganization(id));
  };

  return (
    <div
      className="flex flex-col border-overlay/10 border-b pb-1"
      data-testid="organization-switcher"
    >
      <span className="px-2.5 pt-1.5 pb-1 text-2xs text-ink-subtle uppercase tracking-wide">
        {t("organization.switcher.title")}
      </span>
      {organizations.map((organization) => {
        const active = organization.id === activeId;
        return (
          <button
            key={organization.id}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => choose(organization.id)}
            className={ITEM_CLASS}
            data-testid={`organization-option-${organization.id}`}
          >
            <Avatar
              src={organization.avatarUrl}
              name={organization.name}
              alt=""
              size="xs"
              className="h-6 w-6 shrink-0 border-0 bg-overlay/15 text-2xs text-ink-strong"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-ink-strong">
                {organization.name}
              </span>
              {organization.personal && (
                <span className="text-2xs text-ink-subtle">
                  {t("organization.switcher.personal")}
                </span>
              )}
            </span>
            <Tag size="sm" variant="neutral" className="shrink-0">
              {t(`organization.role.${organization.role}`)}
            </Tag>
            <Check
              aria-hidden="true"
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "text-ink-strong" : "invisible",
              )}
            />
          </button>
        );
      })}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDone();
          onCreate();
        }}
        className={ITEM_CLASS}
        data-testid="organization-create"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {t("organization.switcher.create")}
      </button>
    </div>
  );
}
