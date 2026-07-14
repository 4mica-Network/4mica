import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brainMode, judgeSetup, rateJoke } from "./brain";
import { payAndFetch } from "./pay";

function comedianBase(): string {
  if (process.env.COMEDIAN_URL) return process.env.COMEDIAN_URL;
  try {
    const base = readFileSync(
      join(tmpdir(), "__TMPFILE__"),
      "utf8",
    ).trim();
    if (base) return base;
  } catch {
    return "http://localhost:__PORT__";
  }
  return "http://localhost:__PORT__";
}

const BASE = comedianBase();
const THEME = process.env.THEME ?? "programming";
const GOAL = Number(process.env.GOAL ?? 4);
const BUDGET = Number(process.env.BUDGET ?? 1200);
const KEEP_THRESHOLD = Number(process.env.THRESHOLD ?? 7);
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS ?? 16);
const CATEGORIES = [
  "puns",
  "wordplay",
  "observational",
  "dad",
  "absurd",
  "meta",
];

type Setup = {
  jokeId: string;
  category: string;
  setup: string;
  price: number;
};
type Punchline = { punchline: string; category: string };

const stats: Record<string, { n: number; avg: number }> = {};
const kept: {
  category: string;
  setup: string;
  punchline: string;
  score: number;
}[] = [];
let budget = BUDGET;
let spent = 0;

// Multi-armed bandit: exploit the highest-rated category, but explore sometimes.
// Unseen categories get an optimistic prior so the agent tries each at least once.
function pickCategory(): string {
  if (Math.random() < 0.3) {
    return CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  }
  return [...CATEGORIES].sort((a, b) => value(b) - value(a))[0];
}

function value(category: string): number {
  const s = stats[category];
  return s && s.n > 0 ? s.avg : 8.5; // optimistic prior for the unexplored
}

function record(category: string, score: number): void {
  const s = stats[category] ?? { n: 0, avg: 0 };
  s.avg = (s.avg * s.n + score) / (s.n + 1);
  s.n += 1;
  stats[category] = s;
}

async function feedback(category: string, score: number): Promise<void> {
  await fetch(`${BASE}/rating`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category, score }),
  }).catch(() => {});
}

async function main() {
  console.log(
    `🎯 Critic goal: curate ${GOAL} jokes on "${THEME}" scoring ≥${KEEP_THRESHOLD}/10, budget ${BUDGET} credits.`,
  );
  console.log(`🧠 Judgment: ${brainMode}. Comedian: ${BASE}\n`);

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (kept.length >= GOAL) break;
    const category = pickCategory();

    const teaserRes = await fetch(
      `${BASE}/setup?theme=${encodeURIComponent(THEME)}&category=${category}`,
    );
    if (!teaserRes.ok) {
      console.log(
        `[critic] comedian unavailable (${teaserRes.status}). Stopping.`,
      );
      return;
    }
    const teaser = (await teaserRes.json()) as Setup;
    const slotsLeft = GOAL - kept.length;

    console.log(
      `[round ${round}] 🎰 probing "${category}" (avg ${value(category).toFixed(1)}) → free setup: "${teaser.setup}"`,
    );

    const verdict = await judgeSetup({
      theme: THEME,
      category,
      setup: teaser.setup,
      price: teaser.price,
      budgetLeft: budget,
      slotsLeft,
    });

    if (!verdict.buy) {
      console.log(
        `           🤔 predicted ${verdict.predicted}/10, punchline ${teaser.price} credits → PASS (${verdict.reason})\n`,
      );
      continue;
    }

    console.log(
      `           🤔 predicted ${verdict.predicted}/10 → BUY the punchline for ${teaser.price} credits (${verdict.reason})`,
    );

    const paid = await payAndFetch<Punchline>(
      `${BASE}/punchline?jokeId=${teaser.jokeId}`,
    );
    if (paid.status !== 200 || !paid.body) {
      console.log(`           ❌ payment/fetch failed (${paid.status})\n`);
      continue;
    }
    budget -= paid.paid;
    spent += paid.paid;
    console.log(
      `           💸 paid ${paid.paid} credits via x402 (budget: ${budget} left) → punchline: "${paid.body.punchline}"`,
    );

    const rated = await rateJoke({
      theme: THEME,
      setup: teaser.setup,
      punchline: paid.body.punchline,
    });
    record(category, rated.score);
    await feedback(category, rated.score);

    const verdictLine =
      rated.score >= KEEP_THRESHOLD ? "⭐ KEEP" : "🗑️  discard";
    if (rated.score >= KEEP_THRESHOLD) {
      kept.push({
        category,
        setup: teaser.setup,
        punchline: paid.body.punchline,
        score: rated.score,
      });
    }
    console.log(
      `           😂 rated ${rated.score}/10 (${rated.critique}) → ${verdictLine}. "${category}" avg now ${value(category).toFixed(1)}\n`,
    );

    if (budget < 60) {
      console.log("[critic] budget nearly exhausted — wrapping up.\n");
      break;
    }
  }

  console.log("──────────── curated set ────────────");
  if (kept.length === 0) {
    console.log("Nothing met the bar. Tough crowd.");
  }
  kept
    .sort((a, b) => b.score - a.score)
    .forEach((j, i) => {
      console.log(`${i + 1}. [${j.category} · ${j.score}/10]`);
      console.log(`   ${j.setup}`);
      console.log(`   ${j.punchline}`);
    });

  const best = Object.entries(stats).sort((a, b) => b[1].avg - a[1].avg)[0];
  console.log("─────────────────────────────────────");
  console.log(
    `🏁 Kept ${kept.length}/${GOAL} · spent ${spent} of ${BUDGET} credits` +
      (best
        ? ` · best category: ${best[0]} (${best[1].avg.toFixed(1)}/10)`
        : ""),
  );
}

main().catch((err) => {
  console.error("[critic] failed:", err);
  process.exitCode = 1;
});
