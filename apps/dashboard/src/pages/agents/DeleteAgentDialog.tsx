import { Button, Modal, Spinner } from "@4mica/ui";
import { selectIsAgentPending } from "@stores/agent/selector";
import type { Agent } from "@stores/agent/type";
import { useAppSelector } from "@stores/hooks";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  const isPending = useAppSelector(
    selectIsAgentPending(agent ? `agent:${agent.id}` : "batchDeleteAgents"),
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        agent
          ? t("agent.delete.title")
          : t("agent.delete.batchTitle", { count })
      }
      size="sm"
      data-testid="delete-agent"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            intent="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            {t("agent.delete.cancel")}
          </Button>
          <Button
            intent="primary"
            size="sm"
            className="btn-no-lift min-w-24 bg-danger text-surface-deep hover:bg-danger"
            disabled={isPending}
            onClick={onConfirm}
            data-testid="delete-agent-confirm"
          >
            <span className="flex w-full items-center justify-center text-sm">
              {isPending ? <Spinner size="sm" /> : t("agent.delete.confirm")}
            </span>
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-ink-body text-sm">
            {agent
              ? t("agent.delete.body", { name: agent.name })
              : t("agent.delete.batchBody", { count })}
          </p>
          <p className="mt-2 text-ink-subtle text-xs">
            {t("agent.delete.hint")}
          </p>
        </div>
      </div>
    </Modal>
  );
}
