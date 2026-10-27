import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { x402ResourceServer } from "@4mica/x402/server";
import { paymentMiddleware } from "@4mica/x402/server/express";
import type { FacilitatorClient } from "@x402/core/server";
import express from "express";
import { brainMode, inventJoke, type Joke } from "./brain";

const PORT_FILE = join(tmpdir(), "__TMPFILE__");
const CATEGORIES = [
  "puns",
  "wordplay",
  "observational",
  "dad",
  "absurd",
  "meta",
];
const BASE_PRICE = 100;

const NETWORK = "eip155:84532";
// Base Sepolia USDC, one of the stablecoins 4mica core accepts there.
const ASSET = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f";
const PAY_TO = "0x1111111111111111111111111111111111111111";

// Demo mode: stands in for the 4mica facilitator and accepts any payment. To go
// live, pass `new FourMicaFacilitatorClient()` from @4mica/x402/server instead.
const demoFacilitator: FacilitatorClient = {
  async getSupported() {
    return {
      kinds: [{ x402Version: 2, scheme: "4mica-credit", network: NETWORK }],
      extensions: [],
      signers: {},
    };
  },
  async verify() {
    return { isValid: true };
  },
  async settle(_paymentPayload, requirements) {
    return {
      success: true,
      transaction: "",
      network: requirements.network,
      extra: {
        receipt: { receipt: "0xdemoReceipt", signature: "0xdemoSignature" },
      },
    };
  },
};

type Listing = { theme: string; category: string; joke: Joke; price: number };
const inventory = new Map<string, Listing>();
const demand: Record<string, number> = {};
const rating: Record<string, { sum: number; n: number }> = {};
let nextId = 1;
let revenue = 0;

function priceFor(category: string): number {
  const d = demand[category] ?? 0;
  const rep = rating[category];
  const quality = rep && rep.n > 0 ? rep.sum / rep.n : 6;
  const demandMult = 1 + 0.18 * d;
  const qualityMult = 0.7 + quality / 14;
  return Math.round(BASE_PRICE * demandMult * qualityMult);
}

const app = express();
app.use(express.json());

app.use(
  paymentMiddleware(
    {
      "GET /punchline": {
        accepts: {
          scheme: "4mica-credit",
          // Each punchline costs what its setup quoted.
          price: ({ adapter }) => {
            const jokeId = new URL(adapter.getUrl()).searchParams.get("jokeId");
            const listing = inventory.get(jokeId ?? "");
            return {
              amount: String(listing?.price ?? BASE_PRICE),
              asset: ASSET,
            };
          },
          network: NETWORK,
          payTo: PAY_TO,
        },
        description:
          "A premium punchline, brought to you by an agent that needs paying",
      },
    },
    new x402ResourceServer(demoFacilitator),
  ),
);

app.get("/setup", async (req, res) => {
  const theme = String(req.query.theme ?? "everyday life");
  const category = CATEGORIES.includes(String(req.query.category))
    ? String(req.query.category)
    : CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

  const joke = await inventJoke(theme, category);
  const price = priceFor(category);
  const jokeId = `joke-${nextId++}`;
  inventory.set(jokeId, { theme, category, joke, price });

  console.log(
    `[comedian] 🎤 teaser #${jokeId} (${category}) — "${joke.setup}" — punchline costs ${price} credits`,
  );
  res.json({ jokeId, category, setup: joke.setup, price, currency: "credits" });
});

app.get("/punchline", async (req, res) => {
  const jokeId = String(req.query.jokeId ?? "");
  const listing = inventory.get(jokeId);
  if (!listing) {
    res.status(404).json({ error: "unknown jokeId — buy a /setup first" });
    return;
  }

  demand[listing.category] = (demand[listing.category] ?? 0) + 1;
  revenue += listing.price;
  console.log(
    `[comedian] 💰 sold ${listing.category} punchline for ${listing.price} credits (revenue: ${revenue}) — next ${listing.category} will cost ${priceFor(listing.category)}`,
  );
  res.json({ punchline: listing.joke.punchline, category: listing.category });
});

app.post("/rating", (req, res) => {
  const category = String(req.body?.category ?? "");
  const score = Number(req.body?.score);
  if (CATEGORIES.includes(category) && Number.isFinite(score)) {
    const rep = rating[category] ?? { sum: 0, n: 0 };
    rep.sum += score;
    rep.n += 1;
    rating[category] = rep;
    console.log(
      `[comedian] 📨 feedback: ${category} rated ${score}/10 (avg ${(rep.sum / rep.n).toFixed(1)}) — adjusting price/quality`,
    );
  }
  res.json({ ok: true });
});

function listen(port: number, attemptsLeft = 20) {
  const server = app.listen(port);
  server.once("listening", () => {
    const baseUrl = `http://localhost:${port}`;
    writeFileSync(PORT_FILE, baseUrl);
    console.log(`[comedian] 🎭 open for business on ${baseUrl}`);
    console.log(`[comedian]    brain: ${brainMode}`);
    console.log(
      `[comedian]    GET /setup?theme=&category= is free — punchlines are paid for over x402`,
    );
  });
  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      throw err;
    }
  });
}

const cleanup = () => rmSync(PORT_FILE, { force: true });
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

listen(Number(process.env.PORT ?? __PORT__));
