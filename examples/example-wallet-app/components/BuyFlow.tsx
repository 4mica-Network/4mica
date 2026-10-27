"use client";

import { Button, InputField, Tooltip } from "@4mica/ui";
import { AnimatePresence, motion } from "framer-motion";
import { type FormEvent, useState } from "react";
import { HoldButton } from "@/components/HoldButton";
import { type Status, StatusIcon } from "@/components/StatusIcon";
import { Steps } from "@/components/Steps";
import { FieldRow, Row, shortenAddress } from "@/components/ui";
import type { Purchase } from "@/lib/wallet";

interface Offer {
  price: string;
  network: string;
  payTo: string;
  description: string | null;
}

const post = async <T,>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json;
};

const pathOf = (url: string) => {
  try {
    const { host, pathname } = new URL(url);
    return { host, pathname: pathname || "/" };
  } catch {
    return { host: url, pathname: "/" };
  }
};

const slide = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.22 },
};

export function BuyFlow({ onPurchased }: { onPurchased: () => void }) {
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState(
    process.env.NEXT_PUBLIC_SHOP_URL ?? "http://localhost:3000/quote",
  );
  const [offer, setOffer] = useState<Offer | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Purchase | null>(null);

  const reset = () => {
    setStep(0);
    setOffer(null);
    setStatus(null);
    setError(null);
    setReceipt(null);
  };

  const check = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      setOffer(await post<Offer>("/api/quote", { url }));
      setStatus("success");
      setTimeout(() => {
        setStatus(null);
        setStep(1);
      }, 700);
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
    }
  };

  const pay = async () => {
    setStep(2);
    setStatus("loading");
    setError(null);
    try {
      const purchase = await post<Purchase>("/api/buy", { url });
      if (purchase.status !== 200) {
        throw new Error(JSON.stringify(purchase.body));
      }
      setReceipt(purchase);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
    } finally {
      onPurchased();
    }
  };

  const { host, pathname } = pathOf(url);
  const insight = (receipt?.body as { insight?: string } | null)?.insight;

  return (
    <div className="flex flex-col gap-6">
      <Steps
        steps={["Order", "Pay", "Done"]}
        current={step === 2 && status === "success" ? 3 : step}
      />

      <AnimatePresence mode="popLayout" initial={false}>
        {step === 0 && (
          <motion.form key="order" {...slide} onSubmit={check}>
            <div className="flex flex-col gap-6">
              <FieldRow id="url" label="Paid URL">
                <InputField
                  id="url"
                  type="url"
                  required
                  value={url}
                  disabled={status === "loading"}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Button
                  type="submit"
                  intent="invert"
                  className="shrink-0 whitespace-nowrap"
                  disabled={status === "loading"}
                >
                  Check price
                </Button>
              </FieldRow>

              <AnimatePresence>
                {status && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-col items-center gap-2 text-center"
                  >
                    <StatusIcon status={status} />
                    {error && <p className="text-danger text-sm">{error}</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.form>
        )}

        {step === 1 && offer && (
          <motion.div key="pay" {...slide} className="flex flex-col gap-5">
            <div>
              <p className="font-medium text-ink-strong">{host}</p>
              {offer.description && (
                <p className="text-ink-muted text-sm">{offer.description}</p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-overlay/10 border-y border-dashed py-4">
              <Row label={`1 × GET ${pathname}`}>
                <span className="font-mono">{offer.price}</span>
              </Row>
              <Row label="Network">{offer.network}</Row>
              <Row label="Pay to">
                <Tooltip title={offer.payTo} placement="bottom">
                  <span className="font-mono">
                    {shortenAddress(offer.payTo)}
                  </span>
                </Tooltip>
              </Row>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-ink-muted text-sm">Total</span>
              <span className="font-mono font-semibold text-2xl text-ink-strong tabular-nums">
                {offer.price}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <HoldButton onConfirm={pay}>Hold to pay {offer.price}</HoldButton>
              <Button intent="ghost" onClick={reset}>
                Back
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && status && (
          <motion.div
            key="done"
            {...slide}
            className="flex flex-col items-center gap-4 py-4 text-center"
          >
            <StatusIcon status={status} size={72} />
            <div>
              <p className="font-semibold text-ink-strong">
                {status === "loading"
                  ? "Paying…"
                  : status === "success"
                    ? "Payment complete"
                    : "Payment failed"}
              </p>
              {status === "success" && receipt && (
                <p className="mt-1 text-ink-subtle text-xs">
                  {receipt.price} · {new Date(receipt.at).toLocaleTimeString()}
                </p>
              )}
            </div>

            {insight && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="rounded-lg bg-overlay/5 px-4 py-3 text-ink-body text-sm"
              >
                {insight}
              </motion.p>
            )}
            {error && <p className="text-danger text-sm">{error}</p>}

            {status !== "loading" && (
              <Button intent="invert" block onClick={reset}>
                {status === "success" ? "Buy another" : "Start over"}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
