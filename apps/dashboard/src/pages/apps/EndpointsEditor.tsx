import { Button, Modal, Spinner } from "@4mica/ui";
import { replaceApiEndpoints } from "@stores/apiListing/actions";
import {
  selectApiListingError,
  selectApiListingIssues,
  selectIsApiListingPending,
} from "@stores/apiListing/selector";
import type { ApiListing, HttpMethodName } from "@stores/apiListing/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select, TextInput } from "@/components/form";
import { HTTP_METHOD_OPTIONS } from "./constants";
import { type EndpointValues, endpointsSchema } from "./validation";

type Draft = {
  method: HttpMethodName;
  path: string;
  summary: string;
  priceAmount: string;
};

const emptyDraft = (): Draft => ({
  method: "GET",
  path: "",
  summary: "",
  priceAmount: "",
});

export function EndpointsEditor({
  listing,
  onClose,
}: {
  listing: ApiListing | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const pendingKey = listing ? `apiListing:${listing.id}` : "";
  const isSaving = useAppSelector(selectIsApiListingPending(pendingKey));
  const error = useAppSelector(selectApiListingError);
  const issues = useAppSelector(selectApiListingIssues);

  const [rows, setRows] = useState<Draft[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!listing) {
      return;
    }
    setLocalError(null);
    setRows(
      listing.endpoints.map((endpoint) => ({
        method: endpoint.method,
        path: endpoint.path,
        summary: endpoint.summary ?? "",
        priceAmount: endpoint.priceAmount ?? "",
      })),
    );
  }, [listing]);

  const sawSaving = useRef(false);
  useEffect(() => {
    if (isSaving) {
      sawSaving.current = true;
      return;
    }
    if (!sawSaving.current) {
      return;
    }
    sawSaving.current = false;
    if (!error && Object.keys(issues).length === 0) {
      onClose();
    }
  }, [isSaving, error, issues, onClose]);

  const patch = (index: number, next: Partial<Draft>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...next } : row)),
    );

  const save = () => {
    if (!listing) {
      return;
    }

    const endpoints: EndpointValues[] = rows.map((row) => ({
      method: row.method,
      path: row.path.trim(),
      summary: row.summary.trim(),
      priceAmount: row.priceAmount.trim(),
    }));

    const parsed = endpointsSchema.safeParse(endpoints);
    if (!parsed.success) {
      setLocalError(t(parsed.error.issues[0]?.message ?? ""));
      return;
    }

    setLocalError(null);
    dispatch(
      replaceApiEndpoints({
        id: listing.id,
        endpoints: endpoints.map((endpoint, index) => ({
          method: endpoint.method,
          path: endpoint.path,
          summary: endpoint.summary ? endpoint.summary : null,
          priceAmount: endpoint.priceAmount ? endpoint.priceAmount : null,
          sortOrder: index,
        })),
      }),
    );
  };

  return (
    <Modal
      isOpen={Boolean(listing)}
      onClose={onClose}
      title={t("apiListing.endpoints.title")}
      description={t("apiListing.endpoints.description")}
      size="lg"
      data-testid="api-listing-endpoints"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            intent="ghost"
            size="sm"
            className="btn-no-lift"
            disabled={isSaving || rows.length >= 50}
            onClick={() => setRows((current) => [...current, emptyDraft()])}
            data-testid="api-listing-endpoint-add"
          >
            <span className="flex items-center gap-1.5 text-sm">
              <Plus className="h-4 w-4" />
              {t("apiListing.endpoints.add")}
            </span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              intent="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
            >
              {t("apiListing.edit.cancel")}
            </Button>
            <Button
              intent="invert"
              size="sm"
              className="btn-no-lift min-w-24"
              disabled={isSaving}
              onClick={save}
              data-testid="api-listing-endpoints-submit"
            >
              <span className="flex w-full items-center justify-center text-sm">
                {isSaving ? <Spinner size="sm" /> : t("apiListing.edit.save")}
              </span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {rows.length === 0 && (
          <p className="text-ink-muted text-sm">
            {t("apiListing.endpoints.empty")}
          </p>
        )}

        {rows.map((row, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-overlay/10 p-3 sm:flex-row sm:items-start"
            data-testid={`api-listing-endpoint-${index}`}
          >
            <div className="w-full sm:w-32">
              <Select
                id={`endpoint-method-${index}`}
                value={row.method}
                options={HTTP_METHOD_OPTIONS}
                onChange={(value) =>
                  patch(index, { method: value as HttpMethodName })
                }
              />
            </div>

            <div className="min-w-0 flex-1">
              <TextInput
                id={`endpoint-path-${index}`}
                value={row.path}
                placeholder="/limits"
                maxLength={512}
                onChange={(value) => patch(index, { path: value })}
              />
            </div>

            <div className="min-w-0 flex-1">
              <TextInput
                id={`endpoint-summary-${index}`}
                value={row.summary}
                placeholder={t("apiListing.endpoints.summaryPlaceholder")}
                maxLength={280}
                onChange={(value) => patch(index, { summary: value })}
              />
            </div>

            <div className="w-full sm:w-28">
              <TextInput
                id={`endpoint-price-${index}`}
                value={row.priceAmount}
                placeholder={t("apiListing.endpoints.pricePlaceholder")}
                onChange={(value) => patch(index, { priceAmount: value })}
              />
            </div>

            <Button
              type="button"
              intent="ghost"
              size="sm"
              className="btn-no-lift shrink-0 px-2 text-danger"
              aria-label={t("apiListing.endpoints.remove")}
              onClick={() =>
                setRows((current) => current.filter((_, i) => i !== index))
              }
              data-testid={`api-listing-endpoint-remove-${index}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {(localError || error) && (
          <p className="text-danger text-sm">{localError ?? error}</p>
        )}
      </div>
    </Modal>
  );
}
