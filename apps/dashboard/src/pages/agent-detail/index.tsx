import { Button, Spinner } from "@4mica/ui";
import { fetchAgents } from "@stores/agent/actions";
import { selectAgents, selectHasLoadedAgents } from "@stores/agent/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchTrust, resetTrust, savePolicy } from "@stores/trust/actions";
import { selectIsTrustPending, selectPolicy } from "@stores/trust/selector";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { BackBar } from "@/components/BackBar";
import { SettingsSection } from "@/components/layout";
import { FaqEditor } from "@/components/Resource/FaqEditor";
import { PolicyForm } from "@/components/Resource/PolicyForm";
import { ReportsPanel } from "@/components/Resource/ReportsPanel";
import { ReviewsPanel } from "@/components/Resource/ReviewsPanel";
import { SecretKeysSection } from "@/components/Resource/SecretKeysSection";
import { ToggleSection } from "@/components/Resource/ToggleSection";
import { usePageTitle } from "@/hooks/usePageTitle";

export function AgentDetail() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { id = "" } = useParams<{ id: string }>();

  const agents = useAppSelector(selectAgents);
  const hasLoaded = useAppSelector(selectHasLoadedAgents);
  const policy = useAppSelector(selectPolicy);
  const isSavingPolicy = useAppSelector(selectIsTrustPending("savePolicy"));

  const agent = agents.find((row) => row.id === id) ?? null;
  const resource = { kind: "agent" as const, id };

  usePageTitle(
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
    <div className="flex w-full animate-fade-in flex-col pb-16">
      <BackBar label={t("agentDetail.backToAgents")} to="/agents" />

      <div className="mx-auto flex w-full flex-col gap-10 lg:max-w-3xl">
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

        <SecretKeysSection resource={resource} />

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
  );
}
