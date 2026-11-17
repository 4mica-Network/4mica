import { fetchAgent } from "@stores/agent/actions";
import {
  selectCurrentAgent,
  selectCurrentAgentError,
  selectCurrentAgentNotFound,
} from "@stores/agent/selector";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchTrust, resetTrust, savePolicy } from "@stores/trust/actions";
import { selectIsTrustPending, selectPolicy } from "@stores/trust/selector";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { BackBar } from "@/components/BackBar";
import { LoadFailure } from "@/components/LoadFailure";
import { SettingsSection } from "@/components/layout";
import { PageSpinner } from "@/components/PageSpinner";
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

  const current = useAppSelector(selectCurrentAgent);
  const loadError = useAppSelector(selectCurrentAgentError);
  const notFound = useAppSelector(selectCurrentAgentNotFound);
  const policy = useAppSelector(selectPolicy);
  const isSavingPolicy = useAppSelector(selectIsTrustPending("savePolicy"));

  const agent = current?.id === id ? current : null;
  const resource = { kind: "agent" as const, id };

  usePageTitle(
    agent
      ? `${agent.name} · ${t("agentDetail.title")}`
      : t("agentDetail.title"),
  );

  useEffect(() => {
    if (id) {
      dispatch(fetchAgent(id));
    }
  }, [dispatch, id]);

  useEffect(() => {
    if (!id) {
      return;
    }

    dispatch(fetchTrust(resource));

    return () => {
      dispatch(resetTrust());
    };
  }, [dispatch, id]);

  if (!agent && !loadError) {
    return <PageSpinner />;
  }

  if (!agent) {
    return (
      <LoadFailure
        notFound={notFound}
        notFoundLabel={t("agentDetail.notFound")}
        message={loadError}
        onRetry={() => dispatch(fetchAgent(id))}
        backTo="/agents"
        backLabel={t("agentDetail.backToAgents")}
      />
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
