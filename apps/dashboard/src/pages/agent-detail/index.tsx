import { Button, Spinner, Tag } from "@4mica/ui";
import { fetchAgents } from "@stores/agent/actions";
import { selectAgents, selectHasLoadedAgents } from "@stores/agent/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchTrust, resetTrust, savePolicy } from "@stores/trust/actions";
import {
  selectIsTrustPending,
  selectPolicy,
  selectTrustSummary,
} from "@stores/trust/selector";
import { useTitle } from "ahooks";
import { ArrowLeft, ShieldAlert, Star } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { SettingsSection } from "@/components/form";
import { IntegrationGuideLink } from "@/components/IntegrationGuideLink";
import { FaqEditor } from "../app-detail/FaqEditor";
import { PolicyForm } from "../app-detail/PolicyForm";
import { ReportsPanel } from "../app-detail/ReportsPanel";
import { ReviewsPanel } from "../app-detail/ReviewsPanel";
import { ToggleSection } from "../app-detail/ToggleSection";

export function AgentDetail() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { id = "" } = useParams<{ id: string }>();

  const agents = useAppSelector(selectAgents);
  const hasLoaded = useAppSelector(selectHasLoadedAgents);
  const summary = useAppSelector(selectTrustSummary);
  const policy = useAppSelector(selectPolicy);
  const isSavingPolicy = useAppSelector(selectIsTrustPending("savePolicy"));

  const agent = agents.find((row) => row.id === id) ?? null;
  const resource = { kind: "agent" as const, id };

  useTitle(
    agent
      ? `${agent.name} · ${t("agentDetail.title")}`
      : t("agentDetail.title"),
  );

  useEffect(() => {
    if (!hasLoaded) {
      dispatch(fetchAgents());
    }
  }, [dispatch, hasLoaded]);

  useEffect(() => {
    if (!id) {
      return;
    }

    dispatch(fetchTrust(resource));

    return () => {
      dispatch(resetTrust());
    };
  }, [dispatch, id]);

  if (!hasLoaded && !agent) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        <p className="text-ink-muted text-sm">{t("agentDetail.notFound")}</p>
        <Button asChild intent="outline" size="sm">
          <Link to="/agents">{t("agentDetail.backToAgents")}</Link>
        </Button>
      </div>
    );
  }

  const policyEnabled = policy?.policyEnabled ?? true;
  const faqEnabled = policy?.faqEnabled ?? true;

  return (
    <div className="relative flex size-full min-h-0 flex-col">
      <div className="pointer-events-none sticky top-0 z-20 -mb-10">
        <Button
          asChild
          className="pointer-events-auto"
          intent="ghost"
          size="sm"
        >
          <Link to="/agents">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("agentDetail.backToAgents")}
          </Link>
        </Button>
      </div>

      <div className="flex w-full flex-1 animate-fade-in flex-col overflow-y-auto pr-3 pb-16">
        <div className="mx-auto flex w-full flex-col gap-10 pt-12 lg:max-w-3xl">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-semibold text-2xl text-ink-strong tracking-tight">
                {agent.name}
              </h1>

              {summary && summary.ratingCount > 0 && (
                <Tag size="sm" variant="neutral">
                  <Star className="mr-1 h-3 w-3 fill-warning text-warning" />
                  {(summary.ratingAverage ?? 0).toFixed(1)} ·{" "}
                  {summary.ratingCount}
                </Tag>
              )}

              {summary && summary.openReports > 0 && (
                <Tag size="sm" variant="warning">
                  <ShieldAlert className="mr-1 h-3 w-3" />
                  {t("appDetail.openReports", { count: summary.openReports })}
                </Tag>
              )}
            </div>

            {agent.headline && (
              <p className="text-ink-muted text-sm">{agent.headline}</p>
            )}

            <IntegrationGuideLink
              isPayable={agent.payToAddress !== null}
              kind="agent"
              ref={agent.slug ?? agent.id}
              visibility={agent.visibility}
            />
          </header>

          <ToggleSection
            checked={policyEnabled}
            description={t("appDetail.policyLead")}
            id="agent-policy-enabled"
            isSaving={isSavingPolicy}
            onToggle={(checked) =>
              dispatch(savePolicy(resource, { policyEnabled: checked }))
            }
            title={t("appDetail.tabs.policy")}
          >
            <PolicyForm resource={resource} />
          </ToggleSection>

          <ToggleSection
            checked={faqEnabled}
            description={t("appDetail.faq.lead")}
            id="agent-faq-enabled"
            isSaving={isSavingPolicy}
            onToggle={(checked) =>
              dispatch(savePolicy(resource, { faqEnabled: checked }))
            }
            title={t("appDetail.faq.title")}
          >
            <FaqEditor resource={resource} />
          </ToggleSection>

          <SettingsSection
            description={t("appDetail.reviewsLead")}
            title={t("appDetail.tabs.reviews")}
          >
            <ReviewsPanel id={id} kind="agent" />
          </SettingsSection>

          <SettingsSection
            description={t("appDetail.reportsLead")}
            title={t("appDetail.tabs.reports")}
          >
            <ReportsPanel id={id} kind="agent" />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
