import { agentPendingKeys, selectIsAgentPending } from "@stores/agent";
import type { Agent } from "@stores/agent/type";
import { useAppSelector } from "@stores/hooks";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

export function DeleteAgentDialog({
  agent,
  count,
  isOpen,
  onConfirm,
  onClose,
}: {
  agent: Agent | null;
  count: number;
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isPending = useAppSelector(
    selectIsAgentPending(
      agent ? agentPendingKeys.row(agent.id) : agentPendingKeys.batchDelete,
    ),
  );

  return (
    <DeleteConfirmDialog
      ns="agent"
      data-testid="delete-agent"
      item={agent ? { name: agent.name } : null}
      count={count}
      isOpen={isOpen}
      isPending={isPending}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
