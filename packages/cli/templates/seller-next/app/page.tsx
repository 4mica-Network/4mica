"use client";

import { useState } from "react";

type Requirement = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
};

type Step = {
  label: string;
  status: number;
  ok: boolean;
  body: unknown;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function demoPaymentHeader(req: Requirement) {
  const envelope = {
    x402Version: 1,
    scheme: req.scheme,
    network: req.network,
    payload: {
      claims: {
        version: "v1",
        user_address: "0x2222222222222222222222222222222222222222",
        recipient_address: req.payTo,
        req_id: "0x1",
        amount: `0x${BigInt(req.amount).toString(16)}`,
        asset_address: req.asset,
        timestamp: Math.floor(Date.now() / 1000),
      },
      signature: "0xdemoSignature",
      scheme: "eip712",
    },
  };
  return btoa(JSON.stringify(envelope));
}

function statusClass(status: number) {
  if (status === 200) return "status-200";
  if (status === 402) return "status-402";
  return "status-err";
}

export default function Home() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    setRunning(true);
    setSteps([]);
    try {
      const r1 = await fetch("/api/protected");
      const b1 = (await r1.json()) as { accepts?: Requirement[] };
      setSteps([
        { label: "GET /api/protected", status: r1.status, ok: r1.ok, body: b1 },
      ]);

      const req = b1?.accepts?.[0];
      if (r1.status === 402 && req) {
        await sleep(650);
        const r2 = await fetch("/api/protected", {
          headers: { "X-PAYMENT": demoPaymentHeader(req) },
        });
        const b2 = await r2.json();
        setSteps((s) => [
          ...s,
          {
            label: "GET /api/protected · X-PAYMENT",
            status: r2.status,
            ok: r2.ok,
            body: b2,
          },
        ]);
      }
    } catch (err) {
      setSteps((s) => [
        ...s,
        { label: "request failed", status: 0, ok: false, body: String(err) },
      ]);
    } finally {
      setRunning(false);
    }
  }

  async function copyCurl() {
    await navigator.clipboard?.writeText(
      "curl -i http://localhost:__PORT__/api/protected",
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  const paid = steps.some((s) => s.status === 200);

  return (
    <main className="page">
      <section className="hero">
        <div className="logo-wrap reveal d1">
          <img src="/logo.svg" alt="4Mica" className="logo" />
        </div>

        <span className="badge reveal d2">
          <span className="dot" />
          @4mica/sdk-next
        </span>

        <h1 className="title reveal d2">x402 Paywall</h1>

        <p className="subtitle reveal d3">
          <code>GET /api/protected</code> is gated by a 4Mica x402 paywall. No
          valid payment → <b>402</b>; a signed <code>X-PAYMENT</code> →{" "}
          <b>200</b>. Try the full handshake right here.
        </p>

        <div className="actions reveal d4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={run}
            disabled={running}
          >
            {running ? "Running…" : paid ? "Run again" : "Test the paywall →"}
          </button>
          <a
            className="btn btn-ghost"
            href="https://github.com/4mica-Network"
            target="_blank"
            rel="noreferrer"
          >
            Read the docs
          </a>
        </div>

        {steps.map((step, i) => (
          <div className="panel" key={`${step.label}-${i}`}>
            <div className="panel-head">
              <span className="dot-red" />
              <span className="dot-amber" />
              <span className="dot-green" />
              <span style={{ marginLeft: 6 }}>{step.label}</span>
              <span className={`status-pill ${statusClass(step.status)}`}>
                {step.status || "ERR"}
              </span>
            </div>
            <pre>{JSON.stringify(step.body, null, 2)}</pre>
          </div>
        ))}

        {paid && (
          <p className="hint reveal">
            🔓 Payment accepted — the resource unlocked. In production the mock
            verifier is replaced by <b>client.rpc</b> from{" "}
            <code>@4mica/sdk-node</code>.
          </p>
        )}

        <div className="code reveal d5">
          <span>
            <span className="prompt">$ </span>
            curl -i http://localhost:__PORT__/api/protected
          </span>
          <button type="button" className="copy" onClick={copyCurl}>
            {copied ? "copied ✓" : "copy"}
          </button>
        </div>

        <div className="foot reveal d6">
          <span>Powered by</span>
          <a
            href="https://github.com/4mica-Network"
            target="_blank"
            rel="noreferrer"
          >
            4Mica
          </a>
          <span>·</span>
          <span>credit-layer infrastructure for the agentic economy</span>
        </div>
      </section>
    </main>
  );
}
