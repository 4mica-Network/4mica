'use client';

import { useState } from 'react';
import Link from 'next/link';

type LangId = 'typescript' | 'python';

const CLIENT_SNIPPET: Record<LangId, string> = {
  typescript: `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

// 1. Create your account
const account = privateKeyToAccount("0xYourPrivateKey");
// 2. Register the 4Mica credit scheme
const scheme = await FourMicaEvmScheme.create(account);
// 3. Wrap your existing fetch. That's it.
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:84532", client: scheme }],
});

// Now every request is credit-based. No gas, no chain.
const response = await fetchWithPayment("https://api.example.com/data");`,

  python: `from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

# 1. Create client
client = x402ClientSync()
# 2. Register the 4Mica scheme
client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))
# 3. Wrap requests. That's it.
session = x402_requests(client)

# Credit-based, off-chain, instant
response = session.get("https://api.example.com/data")`,
};

const SERVER_SNIPPET: Record<LangId, string> = {
  typescript: `import express from "express";
import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";
import { FourMicaEvmScheme } from "@4mica/x402/server";

const app = express();

// Add 4Mica middleware. One line.
app.use(
  paymentMiddlewareFromConfig(
    { "GET /data": { accepts: { scheme: "4mica-credit", price: "$0.01",
        network: "eip155:84532", payTo: "0xYourAddress" } } },
    { advertisedEndpoint: "https://api.example.com/tabs" },
    undefined,
    [{ network: "eip155:84532", server: new FourMicaEvmScheme("https://api.example.com/tabs") }]
  )
);

app.get("/data", (req, res) => res.json({ data: "premium content" }));
app.listen(3000);`,

  python: `from fastapi import FastAPI
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

# Add 4Mica middleware. One line.
middleware = fastapi_payment_middleware_from_config(
  { "GET /data": { "accepts": { "scheme": "4mica-credit",
      "price": "$0.01", "network": "eip155:11155111",
      "payTo": "0xYourAddress" } } },
  tab_endpoint="https://api.example.com/tabs",
)

@app.middleware("http")
async def x402_mw(request, call_next):
    return await middleware(request, call_next)

@app.get("/data")
async def data():
    return {"data": "premium content"}`,
};

const KEYWORDS = {
  typescript: ['import', 'from', 'const', 'await', 'async', 'return', 'new'],
  python: ['import', 'from', 'async', 'def', 'await', 'return', 'class'],
};

const STRINGS_RE = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
const COMMENT_RE = /(\/\/.*$|#.*$)/;

function highlightLine(line: string, lang: LangId): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const commentMatch = line.match(COMMENT_RE);
  if (commentMatch && line.trimStart().startsWith(commentMatch[1].trim().slice(0, 2))) {
    const idx = line.indexOf(commentMatch[1]);
    const before = line.slice(0, idx);
    return (
      processTokens(before, lang) +
      `<span style="color:rgba(148,163,184,0.62);font-style:italic">${esc(commentMatch[1])}</span>`
    );
  }
  return processTokens(line, lang);
}

function processTokens(line: string, lang: LangId): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const kws = KEYWORDS[lang];
  let result = '';
  const strParts = line.split(STRINGS_RE);
  for (let i = 0; i < strParts.length; i++) {
    const part = strParts[i];
    if ((part.startsWith('"') || part.startsWith("'") || part.startsWith('`')) && i % 2 === 1) {
      result += `<span style="color:#86efac">${esc(part)}</span>`;
    } else {
      let p = esc(part);
      kws.forEach((kw) => {
        p = p.replace(
          new RegExp(`\\b(${kw})\\b`, 'g'),
          `<span style="color:#7dd3fc">$1</span>`
        );
      });
      result += p;
    }
  }
  return result;
}

export default function CodeSamplesSection() {
  const [lang, setLang] = useState<LangId>('typescript');
  const [side, setSide] = useState<'client' | 'server'>('client');

  const code = side === 'client' ? CLIENT_SNIPPET[lang] : SERVER_SNIPPET[lang];
  const lines = code.trimEnd().split('\n');

  return (
    <section id="integration" className="py-24 section-gloss">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-10">
            <p className="section-kicker">Integration</p>
            <h2 className="mt-2 section-title-sm">3 lines to enable credit-based payments</h2>
            <p className="section-lead mt-1 max-w-xl">
              Works with your existing HTTP client. No contract changes. No new wallet. Fully x402-compatible.
            </p>
          </div>

          {/* Code panel */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 bg-surface-solid px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
                <span className="ml-2 text-[10px] text-ink-subtle uppercase tracking-wider">
                  {side === 'client' ? 'agent / client' : 'api / server'} · {lang}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border border-white/10">
                  {(['client', 'server'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={`px-3 py-1 text-xs font-semibold transition capitalize ${
                        side === s
                          ? 'bg-white/15 text-ink-strong'
                          : 'text-ink-muted hover:text-ink-body'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-lg overflow-hidden border border-white/10">
                  {(['typescript', 'python'] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`px-3 py-1 text-xs font-semibold transition capitalize ${
                        lang === l
                          ? 'bg-white/15 text-ink-strong'
                          : 'text-ink-muted hover:text-ink-body'
                      }`}
                    >
                      {l === 'typescript' ? 'TS' : 'PY'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Code body */}
            <div className="bg-[#050b1d] p-5 sm:p-6 overflow-x-auto">
              <div className="font-mono text-xs leading-6 min-w-max">
                {lines.map((line, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="select-none w-6 text-right text-[10px] text-ink-subtle/60 shrink-0 pt-px">
                      {i + 1}
                    </span>
                    <span
                      className="whitespace-pre text-ink-body/95"
                      dangerouslySetInnerHTML={{ __html: highlightLine(line, lang) || ' ' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 bg-surface-solid px-5 py-3 flex items-center justify-between text-xs text-ink-subtle">
              <span>
                Full docs at{' '}
                <Link href="/resources/technical-docs" className="text-brand-teal hover:text-brand-soft transition">
                  /resources/technical-docs
                </Link>
              </span>
              <span>SDKs: TypeScript · Python · Rust soon</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
