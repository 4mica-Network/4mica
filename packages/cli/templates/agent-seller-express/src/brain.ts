import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.AGENT_MODEL ?? "claude-opus-4-8";
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export const brainMode = client ? `Claude (${MODEL})` : "offline joke bank";

export type Joke = { setup: string; punchline: string };

const PERSONA =
  "You are a quick-witted stand-up comedian. Write ONE original, genuinely funny short joke. " +
  "Keep the setup and punchline each under 25 words. " +
  'Respond with ONLY minified JSON: {"setup":"...","punchline":"..."} and nothing else.';

function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

export async function inventJoke(
  theme: string,
  category: string,
): Promise<Joke> {
  if (!client) return bankJoke(theme, category);
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: PERSONA,
      messages: [
        {
          role: "user",
          content: `Theme: "${theme}". Comedic style: ${category}. Write the joke.`,
        },
      ],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const joke = extractJson<Joke>(text);
    if (joke.setup && joke.punchline) return joke;
  } catch (err) {
    console.error("[comedian] LLM failed, using joke bank:", String(err));
  }
  return bankJoke(theme, category);
}

const BANK: Record<string, Joke[]> = {
  puns: [
    {
      setup: "I told my computer I needed a break,",
      punchline: "and now it won't stop sending me KitKats.",
    },
    {
      setup: "Why did the developer go broke?",
      punchline: "Because he used up all his cache.",
    },
  ],
  wordplay: [
    {
      setup: "I'm reading a book on anti-gravity.",
      punchline: "It's impossible to put down.",
    },
    {
      setup: "Parallel lines have so much in common.",
      punchline: "It's a shame they'll never meet.",
    },
  ],
  observational: [
    {
      setup: "Standups always say 'you ever notice…'",
      punchline: "as if noticing were a career path. Turns out, it is.",
    },
    {
      setup: "We call it 'rush hour,'",
      punchline: "which is odd, because nobody is moving.",
    },
  ],
  dad: [
    {
      setup: "Did you hear about the restaurant on the moon?",
      punchline: "Great food, no atmosphere.",
    },
    {
      setup: "I only know 25 letters of the alphabet.",
      punchline: "I don't know y.",
    },
  ],
  absurd: [
    {
      setup: "My therapist told me to embrace my mistakes,",
      punchline: "so I gave my ex a hug.",
    },
    {
      setup: "I bought the world's worst thesaurus.",
      punchline: "Not only is it terrible, it's also terrible.",
    },
  ],
  meta: [
    {
      setup: "This joke's setup was very expensive to generate,",
      punchline: "but the punchline is where the real value is. Pay up.",
    },
    {
      setup: "An agent walks into a paywall.",
      punchline:
        "It signs a payment, and the bartender says: guarantee issued.",
    },
  ],
};

const counters: Record<string, number> = {};

function bankJoke(_theme: string, category: string): Joke {
  const list = BANK[category] ?? BANK.observational;
  const i = (counters[category] ?? 0) % list.length;
  counters[category] = (counters[category] ?? 0) + 1;
  return list[i];
}
