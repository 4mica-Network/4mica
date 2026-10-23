import { cn, Segmented } from "@4mica/ui";
import type { RankedEntry } from "@stores/payment/type";
import { LayoutGroup, motion } from "framer-motion";
import { ArrowDownWideNarrow, Trophy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { formatAmount, type RankKey, rankBy } from "./metrics";
import { Panel } from "./Panel";

type Source = "listings" | "agents";

const SOURCES: Record<Source, { href: (id: string) => string; bar: string }> = {
  listings: {
    href: (id) => `/apis/${id}`,
    bar: "bg-success",
  },
  agents: {
    href: (id) => `/agents/${id}`,
    bar: "bg-ink-muted",
  },
};

export function Leaderboard({
  listings,
  agents,
}: {
  listings: RankedEntry[];
  agents: RankedEntry[];
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>(
    listings.length === 0 && agents.length > 0 ? "agents" : "listings",
  );
  const [sort, setSort] = useState<RankKey>("amount");

  const style = SOURCES[source];
  const ranked = rankBy(source === "listings" ? listings : agents, sort);
  const peak = Math.max(...ranked.map((entry) => entry.value), 0);
  const total = ranked.reduce((sum, entry) => sum + entry.value, 0);

  const format = (value: number) =>
    sort === "amount" ? formatAmount(value) : value.toLocaleString();

  return (
    <Panel
      title={t("overview.leaders.title")}
      description={t(`overview.leaders.${source}Description`)}
      testId="overview-leaders"
      action={
        <Segmented
          label={t("overview.leaders.source")}
          value={source}
          options={[
            { value: "listings", label: t("overview.leaders.listings") },
            { value: "agents", label: t("overview.leaders.agents") },
          ]}
          onChange={setSource}
          data-testid="overview-leaders-source"
        />
      }
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1 text-ink-subtle text-xs">
        <span>{t("overview.leaders.rank")}</span>
        <button
          type="button"
          onClick={() =>
            setSort((current) =>
              current === "amount" ? "settledCount" : "amount",
            )
          }
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-overlay/5 hover:text-ink-body focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40"
          aria-label={t("overview.leaders.sortBy", {
            key: t(`overview.leaders.sort.${sort}`),
          })}
          data-testid="overview-leaders-sort"
        >
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
          {t(`overview.leaders.sort.${sort}`)}
        </button>
      </div>

      {ranked.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-overlay/5">
            <Trophy className="h-4 w-4 text-ink-subtle" />
          </span>
          <p className="max-w-60 text-ink-subtle text-sm">
            {t(`overview.leaders.${source}Empty`)}
          </p>
        </div>
      ) : (
        <LayoutGroup id={source}>
          <ol className="flex flex-col gap-1 px-2 pb-3">
            {ranked.map((entry, index) => (
              <motion.li
                layout
                key={entry.id}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              >
                <Link
                  to={style.href(entry.id)}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-overlay/5 focus-visible:bg-overlay/5 focus-visible:outline-none"
                  data-testid={`overview-leader-${entry.slug}`}
                >
                  <span
                    className={cn(
                      "w-4 shrink-0 text-right font-mono text-xs tabular-nums",
                      index === 0 ? "text-ink-strong" : "text-ink-subtle",
                    )}
                  >
                    {index + 1}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium text-ink-body text-sm group-hover:text-ink-strong">
                        {entry.name}
                      </span>
                      <span className="shrink-0 font-mono text-ink-strong text-sm tabular-nums">
                        {format(entry.value)}
                        <span className="ml-2 inline-block w-9 text-right text-ink-subtle text-xs">
                          {total === 0
                            ? "—"
                            : `${Math.round((entry.value / total) * 100)}%`}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-overlay/5">
                      <motion.div
                        className={cn("h-full rounded-full", style.bar)}
                        initial={false}
                        animate={{
                          width: `${peak === 0 ? 0 : (entry.value / peak) * 100}%`,
                        }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                </Link>
              </motion.li>
            ))}
          </ol>
        </LayoutGroup>
      )}
    </Panel>
  );
}
