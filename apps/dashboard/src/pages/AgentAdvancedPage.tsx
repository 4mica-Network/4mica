import { Button } from "@4mica/ui";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCollection, useDashboard } from "../app/dashboard-context";
import { Card, PageHeader, Spinner } from "../components/ui";

export function AgentAdvancedPage() {
  const { id = "" } = useParams();
  const { client, refresh } = useDashboard();
  const { data: agent, loading } = useCollection((c) => c.getAgent(id));
  const navigate = useNavigate();

  if (loading) return <Spinner label="Loading…" />;
  if (!agent)
    return (
      <Card className="text-ink-muted text-sm">
        Agent not found.{" "}
        <Link to="/agents" className="text-brand">
          Back to agents
        </Link>
      </Card>
    );

  async function toggleSuspend() {
    if (!agent) return;
    await client.setWhitelisted(agent.id, agent.suspended);
    refresh();
  }

  async function remove() {
    if (!agent) return;
    await client.removeAgent(agent.id);
    navigate("/agents");
  }

  return (
    <div>
      <PageHeader
        title={`${agent.name} · Advanced`}
        subtitle="Trading limits, suspension, and destructive actions."
        action={
          <Button intent="outline" asChild>
            <Link to={`/agents/${agent.id}`}>Back to profile</Link>
          </Button>
        }
      />

      <div className="grid gap-3">
        <Card className="flex items-center justify-between">
          <div>
            <div className="font-medium text-ink-strong text-sm">
              Trading status
            </div>
            <p className="mt-1 text-ink-muted text-sm">
              {agent.suspended
                ? "This agent is suspended and cannot trade."
                : "This agent is allowed to trade."}
            </p>
          </div>
          <Button
            intent={agent.suspended ? "primary" : "soft"}
            onClick={toggleSuspend}
          >
            {agent.suspended ? "Resume trading" : "Suspend"}
          </Button>
        </Card>

        <Card className="border-destructive/30">
          <div className="font-medium text-destructive text-sm">
            Danger zone
          </div>
          <p className="mt-1 mb-3 text-ink-muted text-sm">
            Permanently remove this agent. It will stop trading and be removed
            from your whitelist.
          </p>
          <Button intent="soft" onClick={remove}>
            Remove agent
          </Button>
        </Card>
      </div>
    </div>
  );
}
