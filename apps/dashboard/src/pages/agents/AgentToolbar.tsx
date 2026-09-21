import { Button, InputField, Select, Spinner } from "@4mica/ui";
import {
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
import { useDebounceEffect } from "ahooks";
import { Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NETWORK_OPTIONS } from "@/lib/networks";

export function AgentToolbar({ onBatchDelete }: { onBatchDelete: () => void }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const filters = useAppSelector(selectAgentFilters);
  const selectedIds = useAppSelector(selectSelectedAgentIds);
  const agents = useAppSelector(selectAgents);
  const allSelected = useAppSelector(selectAreAllAgentsSelected);
  const isDeleting = useAppSelector(selectIsAgentPending("batchDeleteAgents"));

  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);

  useDebounceEffect(
    () => {
      if (search !== filters.q) {
        dispatch(setAgentFilters({ q: search }));
      }
    },
    [search],
    { wait: 450 },
  );

  if (selectedIds.length > 0) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-overlay/5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        data-testid="agent-selection-bar"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-ink-strong text-sm">
            {t("agent.toolbar.selected", { count: selectedIds.length })}
          </span>
          <button
            type="button"
            className="rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
            onClick={() =>
              allSelected
                ? dispatch(clearAgentSelection())
                : dispatch(setAgentSelection(agents.map((item) => item.id)))
            }
          >
            {allSelected
              ? t("agent.toolbar.clearSelection")
              : t("agent.toolbar.selectAll")}
          </button>
        </div>

        <Button
          type="button"
          intent="ghost"
          size="sm"
          className="btn-no-lift shrink-0 self-start text-danger sm:self-auto"
          disabled={isDeleting}
          onClick={onBatchDelete}
          data-testid="agent-batch-delete"
        >
          <span className="flex items-center gap-2 text-sm">
            {isDeleting ? (
              <Spinner size="sm" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("agent.toolbar.deleteSelected")}
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:w-80">
        <InputField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("agent.toolbar.searchPlaceholder")}
          aria-label={t("agent.toolbar.searchPlaceholder")}
          icon={<Search className="h-4 w-4 text-ink-subtle" />}
          maxLength={100}
          data-testid="agent-search"
        />
      </div>

      <div className="flex gap-3">
        <div className="w-full sm:w-40">
          <Select
            value={filters.visibility}
            options={[
              { value: "", title: t("agent.toolbar.allVisibilities") },
              { value: "PRIVATE", title: t("agent.visibility.private") },
              {
                value: "UNLISTED",
                title: t("agent.visibility.unlisted"),
              },
              { value: "PUBLIC", title: t("agent.visibility.public") },
            ]}
            onChange={(option) =>
              dispatch(
                setAgentFilters({
                  visibility: (option?.value ?? "") as PublicVisibility | "",
                }),
              )
            }
            data-testid="agent-visibility-filter"
          />
        </div>

        <div className="w-full sm:w-44">
          <Select
            value={filters.network}
            options={[
              { value: "", title: t("agent.toolbar.allNetworks") },
              ...NETWORK_OPTIONS,
            ]}
            onChange={(option) =>
              dispatch(
                setAgentFilters({
                  network: (option?.value ?? "") as PaymentNetwork | "",
                }),
              )
            }
            data-testid="agent-network-filter"
          />
        </div>
      </div>
    </div>
  );
}
