import { Button } from "@4mica/ui";
import { useCollection, useDashboard } from "../app/dashboard-context";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  shortAddr,
} from "../components/ui";

export function WhitelistPage() {
  const { client, refresh } = useDashboard();
  const { data: entries, loading } = useCollection((c) => c.listWhitelist());

  async function toggle(agentId: string, allowed: boolean) {
    await client.setWhitelisted(agentId, allowed);
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Whitelist"
        subtitle="Agents permitted to trade. Maps to the SDK trusted-registry allow-list; blocked agents are effectively suspended."
      />

      {loading && <Spinner label="Loading allow-list…" />}

      {!loading && entries && entries.length === 0 && (
        <EmptyState>No agents to allow-list yet.</EmptyState>
      )}

      <div className="grid gap-3">
        {entries?.map((entry) => (
          <Card
            key={entry.agentId}
            className="flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink-strong">
                  {entry.name}
                </span>
                {entry.allowed ? (
                  <Badge tone="green">allowed</Badge>
                ) : (
                  <Badge tone="red">blocked</Badge>
                )}
              </div>
              <p className="mt-1 font-mono text-ink-subtle text-xs">
                {shortAddr(entry.agentId)} · added{" "}
                {new Date(entry.addedAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              intent={entry.allowed ? "ghost" : "primary"}
              size="sm"
              onClick={() => toggle(entry.agentId, !entry.allowed)}
            >
              {entry.allowed ? "Block" : "Allow"}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
