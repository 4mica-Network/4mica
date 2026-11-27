import { shortenAddress, trimAmount } from "@4mica/rules";
import { Tag } from "@4mica/ui";
import {
  fetchList,
  selectAuthorizations,
  setListFilters,
} from "@stores/finance";
import {
  AUTHORIZATION_STATUSES,
  type AuthorizationFilters,
  type SpendAuthorization,
} from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectProjects } from "@stores/project/selector";
import { formatDateTime } from "@utils/format";
import { ListChecks } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FinancePage } from "@/components/Finance/FinancePage";
import { ListState } from "@/components/Finance/ListState";
import { LoadMore } from "@/components/Finance/LoadMore";
import { Cell, Table } from "@/components/Finance/Table";
import { tokenLabel } from "@/components/Finance/token";
import { TextInput } from "@/components/form";
import { ListToolbar } from "@/components/ListToolbar";
import { Masked } from "@/components/Masked";

const STATUS_VARIANT: Record<
  string,
  "default" | "neutral" | "success" | "warning" | "error"
> = {
  RESERVED: "default",
  PENDING_APPROVAL: "warning",
  DENIED: "error",
  CONSUMED: "success",
  RELEASED: "neutral",
  EXPIRED: "neutral",
};

function AuthorizationRow({ item }: { item: SpendAuthorization }) {
  const { t } = useTranslation();
  return (
    <tr className="bg-surface" data-testid={`authorization-row-${item.id}`}>
      <Cell>
        <Tag size="sm" variant={STATUS_VARIANT[item.status] ?? "neutral"}>
          {t(`finance.authorizationStatus.${item.status}`)}
        </Tag>
        {item.deniedReason && (
          <span className="mt-1 block text-ink-muted text-xs">
            {t(`finance.deniedReason.${item.deniedReason}`, {
              defaultValue: item.deniedReason,
            })}
          </span>
        )}
      </Cell>
      <Cell className="whitespace-nowrap tabular-nums">
        <Masked>{trimAmount(item.amount)}</Masked>{" "}
        <span className="text-ink-subtle text-xs">
          {tokenLabel(item.network, item.assetAddress)}
        </span>
      </Cell>
      <Cell className="font-mono text-xs">
        {item.recipientAddress ? shortenAddress(item.recipientAddress) : "—"}
      </Cell>
      <Cell align="right" className="whitespace-nowrap text-ink-muted text-xs">
        {formatDateTime(item.createdAt ?? item.expiresAt)}
      </Cell>
    </tr>
  );
}

export function SpendAuthorizations() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const list = useAppSelector(selectAuthorizations);
  const projects = useAppSelector(selectProjects);

  useEffect(() => {
    dispatch(fetchList("authorizations"));
  }, [dispatch]);

  const filter = (next: Partial<AuthorizationFilters>) => {
    dispatch(setListFilters("authorizations", next));
    dispatch(fetchList("authorizations"));
  };

  return (
    <FinancePage
      titleKey="finance.authorizations.title"
      descriptionKey="finance.authorizations.description"
    >
      <div className="flex flex-col gap-4">
        <ListToolbar>
          <ListToolbar.Filters>
            <ListToolbar.Filter
              label={t("finance.filter.status")}
              value={list.filters.status}
              options={[
                { value: "", title: t("finance.filter.allStatuses") },
                ...AUTHORIZATION_STATUSES.map((status) => ({
                  value: status,
                  title: t(`finance.authorizationStatus.${status}`),
                })),
              ]}
              onChange={(status) => filter({ status })}
              data-testid="authorization-status-filter"
            />
            <ListToolbar.Filter
              label={t("finance.filter.project")}
              value={list.filters.projectId}
              options={[
                { value: "", title: t("finance.filter.allProjects") },
                ...projects.map((project) => ({
                  value: project.id,
                  title: project.name,
                })),
              ]}
              onChange={(projectId) => filter({ projectId })}
              data-testid="authorization-project-filter"
            />
            <TextInput
              type="date"
              aria-label={t("finance.filter.from")}
              value={list.filters.from}
              onChange={(from) => filter({ from })}
            />
            <TextInput
              type="date"
              aria-label={t("finance.filter.to")}
              value={list.filters.to}
              onChange={(to) => filter({ to })}
            />
          </ListToolbar.Filters>
        </ListToolbar>

        <ListState
          status={list.status}
          error={list.error}
          isEmpty={list.items.length === 0}
          empty={{
            icon: <ListChecks className="h-5 w-5" />,
            title: t("finance.authorizations.emptyTitle"),
            description: t("finance.authorizations.emptyDescription"),
          }}
          onRetry={() => dispatch(fetchList("authorizations"))}
          data-testid="authorizations"
        >
          <Table
            columns={[
              { label: t("finance.authorizations.column.status") },
              { label: t("finance.authorizations.column.amount") },
              { label: t("finance.authorizations.column.recipient") },
              {
                label: t("finance.authorizations.column.time"),
                align: "right",
              },
            ]}
            data-testid="authorizations-table"
          >
            {list.items.map((item) => (
              <AuthorizationRow key={item.id} item={item} />
            ))}
          </Table>
        </ListState>

        <LoadMore
          visible={list.status === "loaded" && Boolean(list.nextCursor)}
          loading={list.isLoadingMore}
          onClick={() =>
            dispatch(fetchList("authorizations", { append: true }))
          }
          data-testid="authorizations-load-more"
        />
      </div>
    </FinancePage>
  );
}
