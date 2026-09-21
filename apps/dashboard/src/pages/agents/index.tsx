import { Button, EmptyState, Pagination, Spinner } from "@4mica/ui";
import {
  batchDeleteAgents,
  deleteAgent,
  fetchAgents,
  setAgentPage,
} from "@stores/agent/actions";
import {
  selectAgentError,
  selectAgentFilters,
  selectAgentLimit,
  selectAgentPage,
  selectAgents,
  selectAgentTotal,
  selectHasLoadedAgents,
  selectIsAgentsLoading,
  selectSelectedAgentIds,
} from "@stores/agent/selector";
import type { Agent } from "@stores/agent/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useTitle } from "ahooks";
import { ArrowUpRight, Bot, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { links } from "@/lib/links";
import { AgentRow } from "./AgentRow";
import { AgentToolbar } from "./AgentToolbar";
import { CreateAgentModal } from "./CreateAgentModal";
import { DeleteAgentDialog } from "./DeleteAgentDialog";
import { EditAgentModal } from "./EditAgentModal";

export function Agents() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const agents = useAppSelector(selectAgents);
  const total = useAppSelector(selectAgentTotal);
  const page = useAppSelector(selectAgentPage);
  const limit = useAppSelector(selectAgentLimit);
  const filters = useAppSelector(selectAgentFilters);
  const selectedIds = useAppSelector(selectSelectedAgentIds);
  const isLoading = useAppSelector(selectIsAgentsLoading);
  const hasLoaded = useAppSelector(selectHasLoadedAgents);
  const error = useAppSelector(selectAgentError);

  useTitle(`${t("page.agents.title")} - ${t("org")}`);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchAgents());
  }, [dispatch]);

  const hasFilters = Boolean(
    filters.q || filters.status || filters.visibility || filters.network,
  );
  const showSpinner = isLoading && !hasLoaded;
  const showError = Boolean(error) && !hasLoaded && !isLoading;

  const confirmDelete = () => {
    if (deleting) {
      dispatch(deleteAgent({ id: deleting.id }));
      setDeleting(null);
    }
  };

  const confirmBatchDelete = () => {
    dispatch(batchDeleteAgents({ ids: selectedIds }));
    setIsBatchDeleteOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
            {t("page.agents.title")}
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            {t("page.agents.description")}
          </p>
        </div>

        <Button
          type="button"
          intent="invert"
          size="sm"
          className="btn-no-lift shrink-0"
          onClick={() => setIsCreateOpen(true)}
          data-testid="agent-create-button"
        >
          <span className="flex items-center gap-1.5 text-sm">
            <Plus className="h-4 w-4" />
            {t("agent.create.cta")}
          </span>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {hasLoaded && (agents.length > 0 || hasFilters) && (
          <AgentToolbar onBatchDelete={() => setIsBatchDeleteOpen(true)} />
        )}

        {showSpinner ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" className="text-ink-subtle" />
          </div>
        ) : showError ? (
          <EmptyState
            className="flex-1"
            icon={<TriangleAlert className="h-5 w-5" />}
            title={t("agent.errorState.title")}
            description={error ?? undefined}
            action={{
              label: t("agent.errorState.retry"),
              onClick: () => dispatch(fetchAgents()),
            }}
            data-testid="agent-error"
          />
        ) : agents.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={<Bot className="h-5 w-5" />}
            title={
              hasFilters
                ? t("agent.empty.filteredTitle")
                : t("agent.empty.title")
            }
            description={
              hasFilters
                ? t("agent.empty.filteredDescription")
                : t("agent.empty.description")
            }
            action={
              hasFilters ? undefined : (
                <div className="flex flex-col items-center gap-3">
                  <Button
                    type="button"
                    intent="invert"
                    size="sm"
                    className="btn-no-lift"
                    onClick={() => setIsCreateOpen(true)}
                    data-testid="agent-empty-create"
                  >
                    <span className="flex items-center gap-1.5 text-sm">
                      <Plus className="h-4 w-4" />
                      {t("agent.create.cta")}
                    </span>
                  </Button>
                  <a
                    href={links.docs}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 text-ink-subtle text-xs transition-colors hover:text-ink-body"
                  >
                    {t("agent.empty.learnMore")}
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              )
            }
            data-testid="agent-empty"
          />
        ) : (
          <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
            {agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="flex justify-end">
            <Pagination
              page={page}
              perPage={limit}
              total={total}
              onPrev={() => dispatch(setAgentPage(page - 1))}
              onNext={() => dispatch(setAgentPage(page + 1))}
              labels={{
                previous: t("agent.pagination.previous"),
                next: t("agent.pagination.next"),
              }}
              data-testid="agent"
            />
          </div>
        )}
      </div>

      <CreateAgentModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <EditAgentModal agent={editing} onClose={() => setEditing(null)} />

      <DeleteAgentDialog
        agent={deleting}
        count={selectedIds.length}
        isOpen={Boolean(deleting) || isBatchDeleteOpen}
        onConfirm={deleting ? confirmDelete : confirmBatchDelete}
        onClose={() => {
          setDeleting(null);
          setIsBatchDeleteOpen(false);
        }}
      />
    </div>
  );
}
