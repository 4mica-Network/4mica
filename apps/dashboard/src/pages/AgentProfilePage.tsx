import { Button } from "@4mica/ui";
import { Link, useParams } from "react-router-dom";
import { useCollection, useDashboard } from "../app/dashboard-context";
import {
  Badge,
  Card,
  formatAmount,
  PageHeader,
  Spinner,
  StatTile,
  shortAddr,
  VerificationBadge,
} from "../components/ui";

export function AgentProfilePage() {
  const { id = "" } = useParams();
  const { client, refresh } = useDashboard();
  const { data: agent, loading } = useCollection((c) => c.getAgent(id));

  if (loading) return <Spinner label="Loading profile…" />;
  if (!agent)
    return (
      <Card className="text-ink-muted text-sm">
        Agent not found.{" "}
        <Link to="/agents" className="text-brand">
          Back to agents
        </Link>
      </Card>
    );

  async function togglePublish() {
    if (!agent) return;
    await client.publishAgent(agent.id, !agent.published);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title={agent.name}
        subtitle={agent.description}
        action={
          <div className="flex items-center gap-2">
            <Button intent="outline" asChild>
              <Link to="/agents">Back</Link>
            </Button>
            <Button intent="outline" asChild>
              <Link to={`/agents/${agent.id}/advanced`}>Advanced</Link>
            </Button>
            <Button
              intent={agent.published ? "soft" : "primary"}
              onClick={togglePublish}
            >
              {agent.published ? "Unpublish" : "Publish"}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <VerificationBadge status={agent.verification} />
        {agent.published ? (
          <Badge tone="green">published</Badge>
        ) : (
          <Badge>draft</Badge>
        )}
        {agent.suspended && <Badge tone="red">suspended</Badge>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Accuracy" value={`${agent.accuracy}%`} />
        <StatTile label="Uptime" value={`${agent.uptime}%`} />
        <StatTile
          label="Price"
          value={formatAmount(agent.pricing.amount, agent.pricing.asset)}
          hint={agent.pricing.network}
        />
        <StatTile
          label="Min score"
          value={agent.policy.minValidationScore}
          hint="validation policy"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium text-ink-strong text-sm">
            Payment & pricing
          </h2>
          <Row label="Pay to" value={shortAddr(agent.payTo)} mono />
          <Row
            label="Amount"
            value={formatAmount(agent.pricing.amount, agent.pricing.asset)}
          />
          <Row label="Asset" value={shortAddr(agent.pricing.asset)} mono />
          <Row label="Network" value={agent.pricing.network} />
        </Card>

        <Card>
          <h2 className="mb-3 font-medium text-ink-strong text-sm">
            Verification & policy
          </h2>
          <Row label="Verification" value={agent.verification} />
          <Row
            label="Min validation score"
            value={String(agent.policy.minValidationScore)}
          />
          <Row
            label="Validator agent"
            value={agent.policy.validatorAgentId ?? "—"}
          />
          <Row
            label="Required tag"
            value={agent.policy.requiredValidationTag ?? "—"}
          />
          <Row
            label="Registry"
            value={
              agent.policy.validationRegistryAddress
                ? shortAddr(agent.policy.validationRegistryAddress)
                : "—"
            }
            mono
          />
        </Card>
      </div>

      <p className="mt-4 text-ink-subtle text-xs">
        Published profiles let other agents discover this agent and request to
        pay for its output over x402. Fields map to the SDK V2 validation
        policy.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-overlay/5 border-b py-1.5 last:border-0">
      <span className="text-ink-muted text-sm">{label}</span>
      <span
        className={
          mono ? "font-mono text-ink-body text-sm" : "text-ink-body text-sm"
        }
      >
        {value}
      </span>
    </div>
  );
}
