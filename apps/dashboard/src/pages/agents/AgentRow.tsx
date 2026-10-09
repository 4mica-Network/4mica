import { formatPrice, PAYMENT_NETWORKS, shortenAddress } from "@4mica/rules";
import { Checkbox, cn, Spinner, Tag } from "@4mica/ui";
import {
  agentPendingKeys,
  publishAgent,
  toggleAgentSelected,
} from "@stores/agent/actions";
import {
  selectIsAgentPending,
  selectIsAgentSelected,
} from "@stores/agent/selector";
import type { Agent } from "@stores/agent/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { EyeOff, Globe, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import {
  STATUS_LABEL_KEYS,
  STATUS_TAG_VARIANT,
  VISIBILITY_LABEL_KEYS,
  VISIBILITY_TAG_VARIANT,
} from "./constants";

export function AgentRow({
  agent,
  onDelete,
}: {
  agent: Agent;
  onDelete: (agent: Agent) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(
    selectIsAgentPending(agentPendingKeys.row(agent.id)),
  );
  const isSelected = useAppSelector(selectIsAgentSelected(agent.id));

  const price = formatPrice(
    agent.priceAmount,
    agent.priceCurrency,
    agent.priceLabel,
  );

  return (
    <div
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 bg-surface px-4 py-3.5 transition-colors",
        isSelected ? "bg-overlay/10" : "hover:bg-overlay/5",
      )}
      data-testid={`agent-row-${agent.id}`}
    >
      <Checkbox
        aria-label={t("agent.row.select", { name: agent.name })}
        variant="square"
        className="relative z-10 mt-0.5 w-auto shrink-0"
        checked={isSelected}
        onChange={() => dispatch(toggleAgentSelected(agent.id))}
        data-testid={`agent-select-${agent.id}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          className="min-w-0 truncate font-semibold text-base text-ink-strong outline-none after:absolute after:inset-0 focus-visible:underline"
          data-testid={`agent-name-${agent.id}`}
          to={`/agents/${agent.id}`}
        >
          {agent.name}
        </Link>

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
            {PAYMENT_NETWORKS[agent.network].label}
          </Tag>

          {price && (
            <Tag size="sm" variant="neutral">
              {t("agent.row.perCall", { price })}
            </Tag>
          )}

          {agent.payToAddress && (
            <Tag size="sm" variant="neutral" className="font-mono">
              {shortenAddress(agent.payToAddress)}
            </Tag>
          )}
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        {isPending && <Spinner size="sm" className="mr-1 text-ink-subtle" />}

        <RowActionsMenu
          label={t("agent.row.more", { name: agent.name })}
          disabled={isPending}
          data-testid={`agent-more-${agent.id}`}
        >
          <RowActionsMenu.RouteItem
            icon={Pencil}
            to={`/agents/${agent.id}`}
            data-testid={`agent-edit-${agent.id}`}
          >
            {t("agent.row.edit")}
          </RowActionsMenu.RouteItem>

          {agent.visibility === "PUBLIC" ? (
            <RowActionsMenu.Item
              icon={EyeOff}
              onSelect={() =>
                dispatch(publishAgent({ id: agent.id, publish: false }))
              }
              data-testid={`agent-unpublish-${agent.id}`}
            >
              {t("agent.row.unpublish")}
            </RowActionsMenu.Item>
          ) : (
            <RowActionsMenu.Item
              icon={Globe}
              disabled={!agent.payToAddress}
              onSelect={() =>
                dispatch(publishAgent({ id: agent.id, publish: true }))
              }
              data-testid={`agent-publish-${agent.id}`}
            >
              {agent.payToAddress
                ? t("agent.row.publish")
                : t("agent.row.publishBlocked")}
            </RowActionsMenu.Item>
          )}

          <RowActionsMenu.Item
            icon={Trash2}
            tone="danger"
            onSelect={() => onDelete(agent)}
            data-testid={`agent-delete-${agent.id}`}
          >
            {t("agent.row.delete")}
          </RowActionsMenu.Item>
        </RowActionsMenu>
      </div>
    </div>
  );
}
