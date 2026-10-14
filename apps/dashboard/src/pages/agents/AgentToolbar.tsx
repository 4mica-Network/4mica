import {
  agentPendingKeys,
  clearAgentSelection,
  setAgentFilters,
  setAgentSelection,
} from "@stores/agent/actions";
import {
  selectAgentFilters,
  selectAgents,
  selectAreAllAgentsSelected,
  selectIsAgentPending,
  selectSelectedAgentIds,
} from "@stores/agent/selector";
import type { PaymentNetwork, PublicVisibility } from "@stores/agent/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useTranslation } from "react-i18next";
import { ListToolbar } from "@/components/ListToolbar";
import { NETWORK_OPTIONS } from "@/lib/networks";
import { VISIBILITY_OPTIONS } from "./constants";

export function AgentToolbar({ onBatchDelete }: { onBatchDelete: () => void }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const filters = useAppSelector(selectAgentFilters);
  const selectedIds = useAppSelector(selectSelectedAgentIds);
  const agents = useAppSelector(selectAgents);
  const allSelected = useAppSelector(selectAreAllAgentsSelected);
  const isDeleting = useAppSelector(
    selectIsAgentPending(agentPendingKeys.batchDelete),
  );

  if (selectedIds.length > 0) {
    return (
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
      />
    );
  }

  return (
    <ListToolbar>
      <ListToolbar.Search
        value={filters.q}
        placeholder={t("agent.toolbar.searchPlaceholder")}
        onSearch={(q) => dispatch(setAgentFilters({ q }))}
        data-testid="agent-search"
      />

      <ListToolbar.Filters>
        <ListToolbar.Filter<PublicVisibility | "">
          label={t("list.filter.visibility")}
          className="sm:w-40"
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
            ...NETWORK_OPTIONS,
          ]}
          onChange={(network) => dispatch(setAgentFilters({ network }))}
          data-testid="agent-network-filter"
        />
      </ListToolbar.Filters>
    </ListToolbar>
  );
}
