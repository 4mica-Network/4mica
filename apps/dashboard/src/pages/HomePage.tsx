import { Link } from "react-router-dom";
import { useCollection } from "../app/dashboard-context";
import {
  Badge,
  Card,
  formatAmount,
  PageHeader,
  Spinner,
  StatTile,
  StatusBadge,
  shortAddr,
} from "../components/ui";

export function HomePage() {
  const agents = useCollection((c) => c.listAgents());
  const txns = useCollection((c) => c.listTransactions());

  const loading = agents.loading || txns.loading;
  const settled = txns.data?.filter((t) => t.status === "settled") ?? [];
  const volume = settled.reduce((sum, t) => sum + Number(t.amount), 0);
  const published = agents.data?.filter((a) => a.published).length ?? 0;
  const recent = [...(txns.data ?? [])].slice(0, 4);

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Your agents, payments, and settlement at a glance."
      />

      {loading && <Spinner label="Loading overview…" />}

      {!loading && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Agents" value={agents.data?.length ?? 0} />
            <StatTile label="Published" value={published} hint="discoverable" />
            <StatTile label="Settled txns" value={settled.length} />
            <StatTile label="Volume" value={`${volume.toLocaleString()} wei`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium text-ink-strong text-sm">
                  Recent transactions
                </h2>
                <Link to="/transactions" className="text-brand text-xs">
                  View all
                </Link>
              </div>
              <div className="grid gap-2">
                {recent.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-ink-body">
                      {shortAddr(t.from)} → {shortAddr(t.to)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink-muted">
                        {formatAmount(t.amount, t.asset)}
                      </span>
                      <StatusBadge status={t.status} />
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium text-ink-strong text-sm">
                  Your agents
                </h2>
                <Link to="/agents" className="text-brand text-xs">
                  Manage
                </Link>
              </div>
              <div className="grid gap-2">
                {agents.data?.slice(0, 4).map((a) => (
                  <Link
                    key={a.id}
                    to={`/agents/${a.id}`}
                    className="flex items-center justify-between text-sm hover:text-brand"
                  >
                    <span className="text-ink-body">{a.name}</span>
                    {a.published ? (
                      <Badge tone="green">published</Badge>
                    ) : (
                      <Badge>draft</Badge>
                    )}
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
