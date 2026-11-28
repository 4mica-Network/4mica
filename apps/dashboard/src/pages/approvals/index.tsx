import { Tag } from "@4mica/ui";
import { fetchList, selectApprovals, setListFilters } from "@stores/finance";
import {
  APPROVAL_KINDS,
  APPROVAL_STATUSES,
  type ApprovalRequest,
} from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { formatDateTime } from "@utils/format";
import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FinancePage } from "@/components/Finance/FinancePage";
import { ListState } from "@/components/Finance/ListState";
import { LoadMore } from "@/components/Finance/LoadMore";
import { Cell, Table } from "@/components/Finance/Table";
import { ListToolbar } from "@/components/ListToolbar";
import { ApprovalDetail } from "./ApprovalDetail";
import { canApply, STATUS_VARIANT } from "./helpers";

function ApprovalRow({
  approval,
  userId,
  onOpen,
}: {
  approval: ApprovalRequest;
  userId: string | undefined;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr
      className="bg-surface hover:bg-overlay/5"
      data-testid={`approval-row-${approval.id}`}
    >
      <Cell>
        <button
          type="button"
          className="text-left font-medium text-ink-strong hover:underline"
          onClick={() => onOpen(approval.id)}
          data-testid={`approval-open-${approval.id}`}
        >
          {approval.summary || approval.action}
        </button>
        <span className="block text-ink-subtle text-xs">
          {t(`finance.kind.${approval.kind}`)}
        </span>
      </Cell>
      <Cell>
        <span className="flex flex-wrap items-center gap-1.5">
          <Tag size="sm" variant={STATUS_VARIANT[approval.status]}>
            {t(`finance.approvalStatus.${approval.status}`)}
          </Tag>
          {canApply(approval, userId) && (
            <Tag size="sm" variant="default">
              {t("finance.approvals.readyToApply")}
            </Tag>
          )}
        </span>
      </Cell>
      <Cell className="whitespace-nowrap tabular-nums">
        {approval.approvals}/{approval.requiredApprovals}
      </Cell>
      <Cell className="text-ink-muted">
        {approval.requestedBy?.name ?? t("finance.approvals.byApiKey")}
      </Cell>
      <Cell align="right" className="whitespace-nowrap text-ink-muted text-xs">
        {formatDateTime(approval.createdAt)}
      </Cell>
    </tr>
  );
}

export function Approvals() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const approvals = useAppSelector(selectApprovals);
  const user = useAppSelector(selectUser);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchList("approvals"));
  }, [dispatch]);

  const filter = (next: { status?: string; kind?: string }) => {
    dispatch(setListFilters("approvals", next));
    dispatch(fetchList("approvals"));
  };

  const selected = approvals.items.find((item) => item.id === openId) ?? null;

  return (
    <FinancePage
      titleKey="finance.approvals.title"
      descriptionKey="finance.approvals.description"
    >
      <div className="flex flex-col gap-4">
        <ListToolbar>
          <ListToolbar.Filters>
            <ListToolbar.Filter
              label={t("finance.filter.status")}
              value={approvals.filters.status}
              options={[
                { value: "", title: t("finance.filter.allStatuses") },
                ...APPROVAL_STATUSES.map((status) => ({
                  value: status,
                  title: t(`finance.approvalStatus.${status}`),
                })),
              ]}
              onChange={(status) => filter({ status })}
              data-testid="approval-status-filter"
            />
            <ListToolbar.Filter
              label={t("finance.filter.kind")}
              value={approvals.filters.kind}
              options={[
                { value: "", title: t("finance.filter.allKinds") },
                ...APPROVAL_KINDS.map((kind) => ({
                  value: kind,
                  title: t(`finance.kind.${kind}`),
                })),
              ]}
              onChange={(kind) => filter({ kind })}
              data-testid="approval-kind-filter"
            />
          </ListToolbar.Filters>
        </ListToolbar>

        <ListState
          status={approvals.status}
          error={approvals.error}
          isEmpty={approvals.items.length === 0}
          empty={{
            icon: <Inbox className="h-5 w-5" />,
            title: t("finance.approvals.emptyTitle"),
            description: t("finance.approvals.emptyDescription"),
          }}
          onRetry={() => dispatch(fetchList("approvals"))}
          data-testid="approvals"
        >
          <Table
            columns={[
              { label: t("finance.approvals.column.request") },
              { label: t("finance.approvals.column.status") },
              { label: t("finance.approvals.column.approvals") },
              { label: t("finance.approvals.column.requester") },
              { label: t("finance.approvals.column.created"), align: "right" },
            ]}
            data-testid="approvals-table"
          >
            {approvals.items.map((approval) => (
              <ApprovalRow
                key={approval.id}
                approval={approval}
                userId={user?.id}
                onOpen={setOpenId}
              />
            ))}
          </Table>
        </ListState>

        <LoadMore
          visible={
            approvals.status === "loaded" && Boolean(approvals.nextCursor)
          }
          loading={approvals.isLoadingMore}
          onClick={() => dispatch(fetchList("approvals", { append: true }))}
          data-testid="approvals-load-more"
        />
      </div>

      <ApprovalDetail approval={selected} onClose={() => setOpenId(null)} />
    </FinancePage>
  );
}
