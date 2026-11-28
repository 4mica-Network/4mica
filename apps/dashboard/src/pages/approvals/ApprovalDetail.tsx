import { Button, Modal, Tag } from "@4mica/ui";
import {
  applyApproval,
  cancelApproval,
  decideApproval,
  financePendingKeys,
  selectIsFinancePending,
} from "@stores/finance";
import type { ApprovalRequest } from "@stores/finance/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { selectCan } from "@stores/organization/selector";
import { PERMISSION } from "@stores/organization/type";
import { selectUser } from "@stores/user/selector";
import { formatDateTime } from "@utils/format";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldRow, TextArea } from "@/components/form";
import { SecretRevealCard } from "@/components/RevealedSecret";
import {
  canApply,
  hasStoredRequest,
  isRequester,
  payloadEntries,
  revealedSecret,
  STATUS_VARIANT,
} from "./helpers";

function Detail({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-2xs text-ink-subtle uppercase tracking-wide">
        {label}
      </dt>
      <dd className="break-words text-ink-body text-sm">{children}</dd>
    </div>
  );
}

export function ApprovalDetail({
  approval,
  onClose,
}: {
  approval: ApprovalRequest | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const canDecidePermission = useAppSelector(
    selectCan(PERMISSION.APPROVALS_DECIDE),
  );
  const isPending = useAppSelector(
    selectIsFinancePending(financePendingKeys.approval(approval?.id ?? "")),
  );
  const [comment, setComment] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    setComment("");
    setSecret(null);
  }, [approval?.id]);

  if (!approval) {
    return null;
  }

  const mine = isRequester(approval, user?.id);
  const open = approval.status === "PENDING";
  const decidable =
    open && !mine && canDecidePermission && approval.canDecide !== false;
  const applicable = canApply(approval, user?.id);
  const stored = applicable && hasStoredRequest(approval.id);
  const entries = payloadEntries(approval.payload);

  const decide = (vote: "APPROVE" | "REJECT") =>
    dispatch(decideApproval({ id: approval.id, vote, comment }));

  return (
    <Modal
      closeLabel={t("modal.close")}
      isOpen
      onClose={onClose}
      title={approval.summary || t(`finance.kind.${approval.kind}`)}
      description={t(`finance.kind.${approval.kind}`)}
      size="lg"
      data-testid="approval-detail"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag size="sm" variant={STATUS_VARIANT[approval.status]}>
            {t(`finance.approvalStatus.${approval.status}`)}
          </Tag>
          <span className="text-ink-muted text-xs">
            {t("finance.approvals.progress", {
              approvals: approval.approvals,
              required: approval.requiredApprovals,
            })}
          </span>
          {approval.executedAt && (
            <Tag size="sm" variant="neutral">
              {t("finance.approvals.applied")}
            </Tag>
          )}
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label={t("finance.approvals.action")}>
            {approval.action}
          </Detail>
          <Detail label={t("finance.approvals.requestedBy")}>
            {approval.requestedBy?.name ??
              (approval.requestedByApiKeyId
                ? t("finance.approvals.byApiKey")
                : "—")}
          </Detail>
          <Detail label={t("finance.approvals.created")}>
            {formatDateTime(approval.createdAt)}
          </Detail>
          <Detail label={t("finance.approvals.expires")}>
            {formatDateTime(approval.expiresAt)}
          </Detail>
        </dl>

        {entries.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="font-semibold text-ink-strong text-sm">
              {t("finance.approvals.payload")}
            </h4>
            <dl
              className="grid gap-x-4 gap-y-2 rounded-lg border border-overlay/10 bg-overlay/5 p-3 sm:grid-cols-2"
              data-testid="approval-payload"
            >
              {entries.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-2xs text-ink-subtle">{key}</dt>
                  <dd className="truncate font-mono text-ink-body text-xs">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-ink-strong text-sm">
            {t("finance.approvals.decisions")}
          </h4>
          {approval.decisions.length === 0 ? (
            <p className="text-ink-muted text-sm">
              {t("finance.approvals.noDecisions")}
            </p>
          ) : (
            <ul
              className="flex flex-col gap-2"
              data-testid="approval-decisions"
            >
              {approval.decisions.map((decision) => (
                <li
                  key={`${decision.user.id}-${decision.createdAt}`}
                  className="flex flex-col gap-0.5 rounded-lg border border-overlay/10 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-ink-strong">
                      {decision.user.name}
                    </span>
                    <Tag
                      size="sm"
                      variant={
                        decision.vote === "APPROVE" ? "success" : "error"
                      }
                    >
                      {t(`finance.vote.${decision.vote}`)}
                    </Tag>
                    <span className="text-ink-subtle text-xs">
                      {formatDateTime(decision.createdAt)}
                    </span>
                  </span>
                  {decision.comment && (
                    <p className="text-ink-muted text-sm">{decision.comment}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {open && mine && (
          <div
            className="flex items-start gap-3 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-3"
            data-testid="approval-self-notice"
          >
            <Users
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted"
            />
            <p className="text-ink-muted text-sm">
              {t("finance.approvals.twoPersonRule")}
            </p>
          </div>
        )}

        {decidable && (
          <div className="flex flex-col gap-3" data-testid="approval-decide">
            <FieldRow
              title={t("finance.approvals.comment")}
              htmlFor="approval-comment"
            >
              <TextArea
                id="approval-comment"
                rows={2}
                value={comment}
                maxLength={500}
                onChange={setComment}
              />
            </FieldRow>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                intent="danger"
                size="sm"
                disabled={isPending}
                onClick={() => decide("REJECT")}
                data-testid="approval-reject"
              >
                {t("finance.approvals.reject")}
              </Button>
              <Button
                type="button"
                intent="invert"
                size="sm"
                className="btn-no-lift"
                loading={isPending}
                onClick={() => decide("APPROVE")}
                data-testid="approval-approve"
              >
                {t("finance.approvals.approve")}
              </Button>
            </div>
          </div>
        )}

        {open && mine && (
          <div className="flex justify-end">
            <Button
              type="button"
              intent="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => dispatch(cancelApproval({ id: approval.id }))}
              data-testid="approval-cancel"
            >
              {t("finance.approvals.cancel")}
            </Button>
          </div>
        )}

        {applicable && (
          <div className="flex flex-col gap-2" data-testid="approval-apply">
            <p className="text-ink-muted text-sm">
              {stored
                ? t("finance.approvals.applyLead")
                : t("finance.approvals.applyMissing")}
            </p>
            {stored && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  intent="invert"
                  size="sm"
                  className="btn-no-lift"
                  loading={isPending}
                  onClick={() =>
                    dispatch(
                      applyApproval({ id: approval.id }, (result) =>
                        setSecret(revealedSecret(result)),
                      ),
                    )
                  }
                  data-testid="approval-apply-button"
                >
                  {t("finance.approvals.apply")}
                </Button>
              </div>
            )}
          </div>
        )}

        {secret && (
          <SecretRevealCard
            title={t("finance.approvals.secretTitle")}
            plaintext={secret}
            onDismiss={() => setSecret(null)}
            data-testid="approval-secret"
          />
        )}
      </div>
    </Modal>
  );
}
