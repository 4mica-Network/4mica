import { useCollection } from "../app/dashboard-context";
import {
  Card,
  EmptyState,
  formatAmount,
  PageHeader,
  Spinner,
  StatTile,
  StatusBadge,
  shortAddr,
} from "../components/ui";

export function TransactionsPage() {
  const { data: txns, loading } = useCollection((c) => c.listTransactions());

  const settled = txns?.filter((t) => t.status === "settled") ?? [];
  const volume = settled.reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="x402 payments between agents on your account."
      />

      {loading && <Spinner label="Loading transactions…" />}

      {!loading && txns && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatTile label="Total" value={txns.length} />
          <StatTile label="Settled" value={settled.length} />
          <StatTile label="Volume" value={`${volume.toLocaleString()} wei`} />
        </div>
      )}

      {!loading && txns && txns.length === 0 && (
        <EmptyState>No transactions yet.</EmptyState>
      )}

      {!loading && txns && txns.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-overlay/10 border-b text-ink-subtle text-xs">
                <th className="px-4 py-3 text-left font-medium">ID</th>
                <th className="px-4 py-3 text-left font-medium">From</th>
                <th className="px-4 py-3 text-left font-medium">To</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr
                  key={t.id}
                  className="border-overlay/5 border-b last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-ink-muted text-xs">
                    {t.id}
                  </td>
                  <td className="px-4 py-3 text-ink-body">
                    {shortAddr(t.from)}
                  </td>
                  <td className="px-4 py-3 text-ink-body">{shortAddr(t.to)}</td>
                  <td className="px-4 py-3 text-right text-ink-body">
                    {formatAmount(t.amount, t.asset)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted text-xs">
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
