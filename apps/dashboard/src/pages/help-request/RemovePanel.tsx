import { Button, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  deleteSupportRequest,
  supportPendingKeys,
} from "@stores/support/actions";
import {
  selectIsSupportPending,
  selectSupportError,
} from "@stores/support/selector";
import type { SupportRequestDetail } from "@stores/support/type";
import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ConfirmAction } from "@/components/ConfirmAction";
import { SectionCard } from "@/components/layout";
import { useOnSuccess } from "@/hooks/useOnSuccess";

export function RemovePanel({ request }: { request: SupportRequestDetail }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const isDeleting = useAppSelector(
    selectIsSupportPending(supportPendingKeys.row(request.id)),
  );

  const error = useAppSelector(selectSupportError);

  const requestedDelete = useRef(false);
  useOnSuccess(isDeleting, Boolean(error), () => {
    if (requestedDelete.current) {
      navigate("/help");
    }
  });
  useEffect(() => {
    if (!isDeleting) {
      requestedDelete.current = false;
    }
  }, [isDeleting]);

  return (
    <SectionCard
      title={t("help.detail.removeTitle")}
      description={t("help.detail.removeLead")}
      data-testid="support-remove"
      action={
        <ConfirmAction
          title={t("help.delete.title")}
          description={t("help.delete.hint")}
          confirmLabel={t("help.delete.confirm")}
          onConfirm={() => {
            requestedDelete.current = true;
            dispatch(deleteSupportRequest({ id: request.id }));
          }}
          data-testid="support-remove"
        >
          <Button
            type="button"
            intent="invert"
            size="sm"
            className="btn-no-lift"
            disabled={isDeleting}
            data-testid="support-remove-button"
          >
            <span className="flex items-center gap-1.5 text-sm">
              {isDeleting && requestedDelete.current ? (
                <Spinner size="sm" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t("help.detail.removeCta")}
            </span>
          </Button>
        </ConfirmAction>
      }
    />
  );
}
