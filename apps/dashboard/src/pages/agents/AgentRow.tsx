import { Button, Checkbox, cn, Dropdown, Spinner, Tag } from "@4mica/ui";
import { publishAgent, toggleAgentSelected } from "@stores/agent/actions";
import {
  selectIsAgentPending,
  selectIsAgentSelected,
} from "@stores/agent/selector";
import type { Agent } from "@stores/agent/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { EyeOff, Globe, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IntegrationGuideLink } from "@/components/IntegrationGuideLink";
import { NETWORKS, shortenAddress } from "@/lib/networks";
import {
  formatPrice,
  STATUS_LABEL_KEYS,
  STATUS_TAG_VARIANT,
  VISIBILITY_LABEL_KEYS,
  VISIBILITY_TAG_VARIANT,
} from "./constants";

const menuItem =
  "flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-overlay/5";

export function AgentRow({
  agent,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(selectIsAgentPending(`agent:${agent.id}`));
  const isSelected = useAppSelector(selectIsAgentSelected(agent.id));

  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchor = useRef<HTMLSpanElement>(null);

  const isPayable = agent.payToAddress !== null && agent.endpointUrl !== null;
  const price = formatPrice(
    agent.priceAmount,
    agent.priceCurrency,
    agent.priceLabel,
  );

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-3 bg-surface px-4 py-3.5 transition-colors",
        isSelected ? "bg-overlay/10" : "hover:bg-overlay/5",
      )}
      data-testid={`agent-row-${agent.id}`}
    >
      <Checkbox
        variant="square"
        className="mt-0.5 w-auto shrink-0"
        checked={isSelected}
        onChange={() => dispatch(toggleAgentSelected(agent.id))}
        data-testid={`agent-select-${agent.id}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className="min-w-0 truncate font-semibold text-base text-ink-strong"
          data-testid={`agent-name-${agent.id}`}
        >
          {agent.name}
        </span>

        {agent.headline && (
          <p className="min-w-0 truncate text-ink-muted text-sm">
            {agent.headline}
          </p>
        )}

        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag size="sm" variant={STATUS_TAG_VARIANT[agent.status]}>
            {t(STATUS_LABEL_KEYS[agent.status])}
          </Tag>

          <Tag size="sm" variant={VISIBILITY_TAG_VARIANT[agent.visibility]}>
            {t(VISIBILITY_LABEL_KEYS[agent.visibility])}
          </Tag>

          <Tag size="sm" variant="neutral">
            {NETWORKS[agent.network].label}
          </Tag>

          {price && (
            <Tag size="sm" variant="neutral">
              {t("agent.row.perCall", { price })}
            </Tag>
          )}

          {/* The RECEIVING address. The payer address is never shown in a
              list — it is the agent's spending identity. */}
          {agent.payToAddress && (
            <Tag size="sm" variant="neutral" className="font-mono">
              {shortenAddress(agent.payToAddress)}
            </Tag>
          )}
        </div>

        <div className="mt-1.5">
          <IntegrationGuideLink
            kind="agent"
            ref={agent.slug ?? agent.id}
            visibility={agent.visibility}
            isPayable={isPayable}
            data-testid={`agent-guide-${agent.id}`}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        {isPending && <Spinner size="sm" className="mr-1 text-ink-subtle" />}

        <span ref={menuAnchor} className="inline-flex">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift px-2"
            aria-label={t("agent.row.more")}
            aria-expanded={menuOpen}
            disabled={isPending}
            onClick={() => setMenuOpen((open) => !open)}
            data-testid={`agent-more-${agent.id}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </span>

        <Dropdown
          isOpen={menuOpen}
          anchorRef={menuAnchor}
          placement="bottomRight"
          onClickOutside={() => setMenuOpen(false)}
        >
          <div className="flex w-60 flex-col py-1">
            <button
              type="button"
              className={cn(menuItem, "text-ink-body")}
              onClick={() => {
                onEdit(agent);
                setMenuOpen(false);
              }}
              data-testid={`agent-edit-${agent.id}`}
            >
              <Pencil className="h-4 w-4" />
              {t("agent.row.edit")}
            </button>

            {agent.visibility === "PUBLIC" ? (
              <button
                type="button"
                className={cn(menuItem, "text-ink-body")}
                onClick={() => {
                  dispatch(publishAgent({ id: agent.id, publish: false }));
                  setMenuOpen(false);
                }}
                data-testid={`agent-unpublish-${agent.id}`}
              >
                <EyeOff className="h-4 w-4" />
                {t("agent.row.unpublish")}
              </button>
            ) : (
              <button
                type="button"
                className={cn(
                  menuItem,
                  agent.payToAddress
                    ? "text-ink-body"
                    : "cursor-not-allowed opacity-50",
                )}
                disabled={!agent.payToAddress}
                onClick={() => {
                  dispatch(publishAgent({ id: agent.id, publish: true }));
                  setMenuOpen(false);
                }}
                data-testid={`agent-publish-${agent.id}`}
              >
                <Globe className="h-4 w-4" />
                {agent.payToAddress
                  ? t("agent.row.publish")
                  : t("agent.row.publishBlocked")}
              </button>
            )}

            <button
              type="button"
              className={cn(menuItem, "text-danger")}
              onClick={() => {
                onDelete(agent);
                setMenuOpen(false);
              }}
              data-testid={`agent-delete-${agent.id}`}
            >
              <Trash2 className="h-4 w-4" />
              {t("agent.row.delete")}
            </button>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
