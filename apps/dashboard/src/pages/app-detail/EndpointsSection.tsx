import { Button } from "@4mica/ui";
import type { ApiListing } from "@stores/apiListing/type";
import { Route } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, SettingsSection } from "@/components/form";
import { EndpointsEditor } from "../apps/EndpointsEditor";

export function EndpointsSection({ listing }: { listing: ApiListing }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  return (
    <SettingsSection
      description={t("appDetail.endpointsLead")}
      title={t("appDetail.tabs.endpoints")}
    >
      <Card>
        {listing.endpoints.length === 0 ? (
          <p className="text-ink-muted text-sm">{t("appDetail.noEndpoints")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-overlay/10">
            {listing.endpoints.map((endpoint) => (
              <li
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
                key={endpoint.id}
              >
                <code className="font-mono text-ink-strong text-sm">
                  <span className="text-ink-subtle">{endpoint.method}</span>{" "}
                  {endpoint.path}
                </code>
                {endpoint.summary && (
                  <span className="min-w-0 flex-1 text-ink-muted text-sm">
                    {endpoint.summary}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="-mx-6 mt-5 flex justify-end border-overlay/10 border-t px-6 pt-4">
          <Button
            className="btn-no-lift"
            intent="invert"
            onClick={() => setEditing(true)}
            size="sm"
            type="button"
          >
            <Route className="mr-1.5 h-4 w-4" />
            {t("appDetail.editEndpoints")}
          </Button>
        </div>
      </Card>

      <EndpointsEditor
        listing={editing ? listing : null}
        onClose={() => setEditing(false)}
      />
    </SettingsSection>
  );
}
