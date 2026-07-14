import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.AGENT_MODEL ?? "claude-opus-4-8";
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export const brainMode = client ? `Claude (${MODEL})` : "offline heuristics";

export type Verdict = { predicted: number; buy: boolean; reason: string };
export type Score = { score: number; critique: string };

const CURATOR =
  "You are a discerning comedy curator assembling a tight set on a theme, with a limited budget. " +
  "You are shown a joke's SETUP only; the punchline costs money. " +
  "Judge how promising the setup is and whether it's worth paying for. Be selective — money is finite. " +
  'Respond with ONLY minified JSON: {"predicted":<1-10>,"buy":<true|false>,"reason":"<short>"}.';

const JUDGE =
  "You are a comedy critic. Rate the full joke on how funny it is, 1-10. Be honest and a little harsh. " +
  'Respond with ONLY minified JSON: {"score":<1-10>,"critique":"<short>"}.';

function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

async function ask(system: string, user: string): Promise<string> {
  if (!client) throw new Error("no ANTHROPIC_API_KEY");
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function judgeSetup(args: {
  theme: string;
  category: string;
  setup: string;
  price: number;
  budgetLeft: number;
  slotsLeft: number;
}): Promise<Verdict> {
  if (price_unaffordable(args)) {
    return { predicted: 0, buy: false, reason: "can't afford the punchline" };
  }
  if (!client) return heuristicJudge(args);
  try {
    const text = await ask(
      CURATOR,
      `Theme: "${args.theme}". Style: ${args.category}. Budget left: ${args.budgetLeft} credits, ${args.slotsLeft} slots to fill.\n` +
        `Punchline price: ${args.price} credits.\nSetup: "${args.setup}"`,
    );
    const v = extractJson<Verdict>(text);
    return {
      predicted: clamp(v.predicted),
      buy: Boolean(v.buy) && args.price <= args.budgetLeft,
      reason: v.reason ?? "",
    };
  } catch {
    return heuristicJudge(args);
  }
}

export async function rateJoke(args: {
  theme: string;
  setup: string;
  punchline: string;
}): Promise<Score> {
  if (!client) return heuristicRate(args);
  try {
    const text = await ask(
      JUDGE,
      `Theme: "${args.theme}".\nSetup: "${args.setup}"\nPunchline: "${args.punchline}"`,
    );
    const s = extractJson<Score>(text);
    return { score: clamp(s.score), critique: s.critique ?? "" };
  } catch {
    return heuristicRate(args);
  }
}

function clamp(n: number): number {
  return Math.max(1, Math.min(10, Math.round(Number(n) || 5)));
}

function price_unaffordable(a: { price: number; budgetLeft: number }): boolean {
  return a.price > a.budgetLeft;
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function heuristicJudge(a: {
  category: string;
  setup: string;
  price: number;
  budgetLeft: number;
}): Verdict {
  const promise = 4 + ((hash(a.setup) % 6) + (a.setup.includes("?") ? 1 : 0));
  const predicted = clamp(promise);
  const buy = predicted >= 6 && a.price <= a.budgetLeft;
  return {
    predicted,
    buy,
    reason: buy
      ? `setup looks promising (${predicted}/10) and ${a.price} fits the budget`
      : `setup too weak (${predicted}/10) to spend ${a.price} credits`,
  };
}

function heuristicRate(a: { setup: string; punchline: string }): Score {
  const setupWords = new Set(a.setup.toLowerCase().split(/\W+/));
  const surprise = a.punchline
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !setupWords.has(w)).length;
  const twist = /\b(but|actually|turns out|because|now)\b/i.test(a.punchline);
  const base = 4 + Math.min(4, surprise) + (twist ? 1 : 0);
  const jitter = (hash(a.punchline) % 3) - 1;
  return {
    score: clamp(base + jitter),
    critique: surprise >= 2 ? "decent twist" : "predictable",
  };
}
