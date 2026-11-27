import {
  agentPendingKeys,
  clearAgentSelection,
  selectAgentFilters,
  selectAgents,
  selectAreAllAgentsSelected,
  selectIsAgentPending,
  selectSelectedAgentIds,
  setAgentFilters,
  setAgentSelection,
} from "@stores/agent";
import type { PaymentNetwork, PublicVisibility } from "@stores/agent/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useTranslation } from "react-i18next";
import { ListToolbar } from "@/components/ListToolbar";
import { useNetworkOptions } from "@/hooks/useNetworkOptions";
import { VISIBILITY_OPTIONS } from "./constants";

export function AgentToolbar({
  onBatchDelete,
  onMove,
}: {
  onBatchDelete: () => void;
  onMove: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const networkOptions = useNetworkOptions();

  const filters = useAppSelector(selectAgentFilters);
  const selectedIds = useAppSelector(selectSelectedAgentIds);
  const agents = useAppSelector(selectAgents);
  const allSelected = useAppSelector(selectAreAllAgentsSelected);
  const isDeleting = useAppSelector(
    selectIsAgentPending(agentPendingKeys.batchDelete),
  );

  const selectionBar =
    selectedIds.length > 0 ? (
      <ListToolbar.SelectionBar
        ns="agent"
        testIdPrefix="agent"
        count={selectedIds.length}
        allSelected={allSelected}
        isDeleting={isDeleting}
        onToggleAll={() =>
          allSelected
            ? dispatch(clearAgentSelection())
            : dispatch(setAgentSelection(agents.map((item) => item.id)))
        }
        onBatchDelete={onBatchDelete}
        onMove={onMove}
      />
    ) : undefined;

  return (
    <ListToolbar>
      <ListToolbar.Search
        value={filters.q}
        placeholder={t("agent.toolbar.searchPlaceholder")}
        onSearch={(q) => dispatch(setAgentFilters({ q }))}
        data-testid="agent-search"
      />

      <ListToolbar.Filters overlay={selectionBar}>
        <ListToolbar.Filter<PublicVisibility | "">
          label={t("list.filter.visibility")}
          value={filters.visibility}
          options={[
            { value: "", title: t("agent.toolbar.allVisibilities") },
            ...VISIBILITY_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.labelKey),
            })),
          ]}
          onChange={(visibility) => dispatch(setAgentFilters({ visibility }))}
          data-testid="agent-visibility-filter"
        />

        <ListToolbar.Filter<PaymentNetwork | "">
          label={t("list.filter.network")}
          value={filters.network}
          options={[
            { value: "", title: t("agent.toolbar.allNetworks") },
            ...networkOptions,
          ]}
          onChange={(network) => dispatch(setAgentFilters({ network }))}
          data-testid="agent-network-filter"
        />
      </ListToolbar.Filters>
    </ListToolbar>
  );
}
