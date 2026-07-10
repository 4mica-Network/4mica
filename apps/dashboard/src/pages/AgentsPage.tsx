import { Button } from "@4mica/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCollection, useDashboard } from "../app/dashboard-context";
import {
  Badge,
  Card,
  EmptyState,
  formatAmount,
  PageHeader,
  Spinner,
  VerificationBadge,
} from "../components/ui";
import type { NewAgentInput } from "../data/types";

export function AgentsPage() {
  const { client, refresh } = useDashboard();
  const { data: agents, loading } = useCollection((c) => c.listAgents());
  const [showForm, setShowForm] = useState(false);

  async function remove(id: string) {
    await client.removeAgent(id);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="Agents allowed to trade on your account. Publish a profile so others can pay to use it."
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add agent"}
          </Button>
        }
      />

      {showForm && (
        <AddAgentForm
          onCreate={async (input) => {
            await client.addAgent(input);
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {loading && <Spinner label="Loading agents…" />}

      {!loading && agents && agents.length === 0 && (
        <EmptyState>No agents yet — add one to start trading.</EmptyState>
      )}

      <div className="grid gap-3">
        {agents?.map((agent) => (
          <Card key={agent.id} className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  to={`/agents/${agent.id}`}
                  className="font-medium text-ink-strong hover:text-brand"
                >
                  {agent.name}
                </Link>
                <VerificationBadge status={agent.verification} />
                {agent.published ? (
                  <Badge tone="green">published</Badge>
                ) : (
                  <Badge>draft</Badge>
                )}
                {agent.suspended && <Badge tone="red">suspended</Badge>}
              </div>
              <p className="mt-1 truncate text-ink-muted text-sm">
                {agent.description}
              </p>
              <p className="mt-1 text-ink-subtle text-xs">
                {formatAmount(agent.pricing.amount, agent.pricing.asset)} ·{" "}
                {agent.uptime}% uptime · {agent.accuracy}% accuracy
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button intent="outline" size="sm" asChild>
                <Link to={`/agents/${agent.id}`}>View</Link>
              </Button>
              <Button intent="ghost" size="sm" onClick={() => remove(agent.id)}>
                Remove
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AddAgentForm({
  onCreate,
}: {
  onCreate: (input: NewAgentInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("100");
  const [minScore, setMinScore] = useState(60);
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim().length > 0 && !busy;

  return (
    <Card className="mb-4">
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canSubmit) return;
          setBusy(true);
          await onCreate({
            name: name.trim(),
            description: description.trim(),
            amount,
            minValidationScore: minScore,
          });
          setBusy(false);
        }}
      >
        <div className="grid gap-1">
          <label className="text-ink-muted text-xs" htmlFor="agent-name">
            Name
          </label>
          <input
            id="agent-name"
            className="rounded-md border border-overlay/15 bg-surface-deep/50 px-3 py-2 text-ink-body text-sm outline-none focus:border-brand"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pricing Oracle"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-ink-muted text-xs" htmlFor="agent-desc">
            Description
          </label>
          <input
            id="agent-desc"
            className="rounded-md border border-overlay/15 bg-surface-deep/50 px-3 py-2 text-ink-body text-sm outline-none focus:border-brand"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this agent sell or buy?"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <label className="text-ink-muted text-xs" htmlFor="agent-amount">
              Price (wei)
            </label>
            <input
              id="agent-amount"
              type="number"
              className="rounded-md border border-overlay/15 bg-surface-deep/50 px-3 py-2 text-ink-body text-sm outline-none focus:border-brand"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-ink-muted text-xs" htmlFor="agent-score">
              Min validation score
            </label>
            <input
              id="agent-score"
              type="number"
              min={1}
              max={100}
              className="rounded-md border border-overlay/15 bg-surface-deep/50 px-3 py-2 text-ink-body text-sm outline-none focus:border-brand"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? "Adding…" : "Add agent"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
