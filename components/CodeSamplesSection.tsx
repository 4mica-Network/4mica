'use client';

import { useState } from 'react';

type LanguageId = 'typescript' | 'python' | 'rust';
type KeyAction = 'payer' | 'recipient';

const languageTabs: { id: LanguageId; label: string }[] = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
];

const keyActions: { id: KeyAction; label: string }[] = [
  { id: 'payer', label: 'Client' },
  { id: 'recipient', label: 'Server' },
];

const codeSamples: Record<LanguageId, Record<KeyAction, string>> = {
  typescript: {
    payer: `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYourPrivateKey");
const scheme = await FourMicaEvmScheme.create(account);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: "eip155:11155111", // Ethereum Sepolia
      client: scheme,
    },
  ],
});

const response = await fetchWithPayment("https://api.example.com/premium-content");
const data = await response.json();
console.log(data);`,
    recipient: `import express from "express";
import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";

const app = express();
app.use(express.json());

app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /premium-content": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.10",
          network: "eip155:11155111", // Ethereum Sepolia
          payTo: "0xYourAddress",
        },
        description: "Access to premium content",
      },
    },
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
    }
  )
);

app.get("/premium-content", (req, res) => {
  res.json({ message: "This is premium content behind a paywall" });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});`,
  },
  python: {
    payer: `from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("eip155:11155111", FourMicaEvmScheme("0xYourPrivateKey"))

session = x402_requests(client)
response = session.get("https://api.example.com/premium-content")
print(response.status_code, response.text)`,
    recipient: `from fastapi import FastAPI
from fourmica_x402.http import fastapi_payment_middleware_from_config

app = FastAPI()

routes = {
    "GET /premium-content": {
        "accepts": {
            "scheme": "4mica-credit",
            "price": "$0.10",
            "network": "eip155:11155111",  # Ethereum Sepolia
            "payTo": "0xYourAddress",
        },
        "description": "Access to premium content",
    },
}

middleware = fastapi_payment_middleware_from_config(
    routes,
    tab_endpoint="https://api.example.com/tabs/open",
)

@app.middleware("http")
async def x402_mw(request, call_next):
    return await middleware(request, call_next)

@app.get("/premium-content")
async def premium_content():
    return {"message": "This is premium content behind a paywall"}`,
  },
  rust: {
    payer: `Will be ready soon!`,
    recipient: `Will be ready soon!`,
  },
};

type TokenPattern = {
  regex: RegExp;
  classes: string[];
};

const tokenPatterns: Record<LanguageId, TokenPattern> = {
  typescript: {
    regex:
      /(\/\/.*$)|(`[^`]*`|'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*")|(\b0x[0-9a-fA-F]+\b|\b\d+(?:_\d+)*(?:\.\d+)?\b)|(\b(?:import|from|async|function|const|let|await|return|new|class|export|default|try|catch|throw|if|else|for|while)\b)|(\b(?:console|Math|Date|BigInt|Number|String|Boolean|Object|process|Promise)\b)/g,
    classes: ['comment', 'string', 'number', 'keyword', 'builtin'],
  },
  python: {
    regex:
      /(#.*$)|('''[^']*'''|"""[^"]*"""|'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*")|(\b0x[0-9a-fA-F]+\b|\b\d+(?:_\d+)*(?:\.\d+)?\b)|(\b(?:import|from|async|def|await|return|class|try|except|raise|if|elif|else|for|while|with|as|in|None|True|False)\b)/g,
    classes: ['comment', 'string', 'number', 'keyword'],
  },
  rust: {
    regex:
      /(\/\/.*$)|(b?"[^"\\]*(?:\\.[^"\\]*)*"|b?'[^'\\]*(?:\\.[^'\\]*)*')|(\b0x[0-9a-fA-F_]+\b|\b\d+(?:_\d+)*(?:\.\d+)?\b)|(\b(?:use|let|mut|async|await|fn|pub|struct|impl|match|if|else|for|while|loop|return|crate|mod|enum|trait|Result|Ok|Err|Some|None)\b)|(\b\w+!)/g,
    classes: ['comment', 'string', 'number', 'keyword', 'macro'],
  },
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const highlightLine = (line: string, language: LanguageId) => {
  const pattern = tokenPatterns[language];
  if (!pattern) {
    return escapeHtml(line);
  }
  let result = '';
  let lastIndex = 0;
  pattern.regex.lastIndex = 0;
  let match = pattern.regex.exec(line);
  while (match) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      result += escapeHtml(line.slice(lastIndex, index));
    }
    const groupIndex = match.slice(1).findIndex((group) => group !== undefined);
    const className = groupIndex >= 0 ? pattern.classes[groupIndex] : '';
    const tokenValue = escapeHtml(match[0]);
    result += className ? `<span class="code-token ${className}">${tokenValue}</span>` : tokenValue;
    lastIndex = index + match[0].length;
    match = pattern.regex.exec(line);
  }
  if (lastIndex < line.length) {
    result += escapeHtml(line.slice(lastIndex));
  }
  return result;
};

export default function CodeSamplesSection() {
  const [activeLanguage, setActiveLanguage] = useState<LanguageId>('typescript');
  const [activeAction, setActiveAction] = useState<KeyAction>('payer');
  const activeCode = codeSamples[activeLanguage][activeAction];
  const codeLines = activeCode.trimEnd().split('\n');
  const highlightedLines = codeLines.map((line) => highlightLine(line, activeLanguage));

  return (
    <section className="py-20 section-gloss">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-5xl">
          <div className="glass-panel rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between text-[10px] sm:text-xs uppercase tracking-[0.24em] text-ink-muted">
              <span>Quick Start</span>
              <span>Client + Server Integration</span>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-surface-solid">
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-surface-solid px-3 py-2">
                {languageTabs.map((tab) => {
                  const isActive = activeLanguage === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveLanguage(tab.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-white/15 text-ink-strong shadow-sm'
                          : 'text-ink-muted hover:text-ink-strong'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid md:grid-cols-[170px_1fr]">
                <div className="border-b border-white/10 bg-surface-solid p-3 md:border-b-0 md:border-r">
                  <div className="flex gap-2 md:flex-col">
                    {keyActions.map((action) => {
                      const isActive = activeAction === action.id;
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => setActiveAction(action.id)}
                          className={`rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                            isActive
                              ? 'bg-white/15 text-ink-strong'
                              : 'text-ink-muted hover:text-ink-strong'
                          }`}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-surface-solid p-4 sm:p-5">
                  <div className="space-y-1 font-mono text-xs sm:text-sm leading-relaxed text-ink-strong">
                    {codeLines.map((line, index) => (
                      <div key={`${activeLanguage}-${activeAction}-${index}`} className="grid grid-cols-[2.2rem_1fr] gap-3">
                        <span className="select-none text-right text-[10px] text-ink-subtle sm:text-xs">
                          {index + 1}
                        </span>
                        <span
                          className="whitespace-pre"
                          dangerouslySetInnerHTML={{ __html: highlightedLines[index] || ' ' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-ink-muted">
              <span>Client and server integration examples</span>
              <span className="text-brand-teal">SDK + API ready</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
