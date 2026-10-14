"use client";

import { Button, InputField, Spinner, TabGroup, Tag, Tooltip } from "@4mica/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShoppingBag } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AutoHeight } from "@/components/AutoHeight";
import { BuyFlow } from "@/components/BuyFlow";
import { FieldRow, Row, shortenAddress } from "@/components/ui";
import type { Purchase } from "@/lib/wallet";

interface WalletView {
  address: string;
  total: string;
  locked: string;
  available: string;
  purchases: Purchase[];
}

function Flip({ value }: { value: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={value}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="inline-block"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

function Balance({
  wallet,
  onDeposited,
}: {
  wallet: WalletView;
  onDeposited: () => void;
}) {
  const [amount, setAmount] = useState("0.01");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const deposit = async (event: FormEvent) => {
    event.preventDefault();
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setState("done");
      onDeposited();
      setTimeout(() => setState("idle"), 1800);
    } catch (err) {
      setState("idle");
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-ink-subtle text-xs uppercase tracking-wide">
          Available
        </p>
        <p className="mt-1 font-mono font-semibold text-3xl text-ink-strong tabular-nums">
          <Flip value={`${wallet.available} ETH`} />
        </p>
      </div>

      <div className="flex flex-col gap-2 border-overlay/10 border-y border-dashed py-4">
        <Row label="Locked">
          <span className="font-mono">
            <Flip value={`${wallet.locked} ETH`} />
          </span>
        </Row>
        <Row label="Total">
          <span className="font-mono">
            <Flip value={`${wallet.total} ETH`} />
          </span>
        </Row>
      </div>

      <form onSubmit={deposit} className="flex flex-col gap-2">
        <FieldRow id="deposit" label="Deposit (ETH)">
          <InputField
            id="deposit"
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            disabled={state === "loading"}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            type="submit"
            intent="invert"
            className="min-w-24 shrink-0 whitespace-nowrap"
            disabled={state !== "idle"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={state}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="inline-flex items-center"
              >
                {state === "loading" ? (
                  <Spinner size="sm" />
                ) : state === "done" ? (
                  <Check className="h-4 w-4 text-success" strokeWidth={3} />
                ) : (
                  "Deposit"
                )}
              </motion.span>
            </AnimatePresence>
          </Button>
        </FieldRow>
        {error && <p className="text-danger text-sm">{error}</p>}
      </form>
    </div>
  );
}

function Purchases({ purchases }: { purchases: Purchase[] }) {
  if (purchases.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-ink-subtle text-sm">
        <ShoppingBag className="h-5 w-5" />
        No purchases yet
      </div>
    );
  }

  return (
    <div className="-mx-6 divide-y divide-overlay/10">
      <AnimatePresence initial={false}>
        {purchases.map((purchase) => {
          const paid = purchase.status === 200;
          const body = purchase.body as { insight?: string } | null;
          return (
            <motion.div
              key={purchase.at}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 px-6 py-3.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-ink-strong text-sm">
                  {body?.insight ?? JSON.stringify(purchase.body)}
                </span>
                <span className="text-ink-subtle text-xs">
                  {new Date(purchase.at).toLocaleTimeString()}
                </span>
              </div>
              <Tag size="sm" variant={paid ? "success" : "error"}>
                {paid ? "Paid" : "Refused"}
              </Tag>
              <span className="font-mono font-semibold text-ink-strong text-sm tabular-nums">
                −{purchase.price}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [tab, setTab] = useState("buy");

  const refresh = useCallback(
    () =>
      fetch("/api/wallet")
        .then((res) => res.json())
        .then(setWallet)
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-4">
        <TabGroup
          tabGroupPlacement="center"
          activeTab={tab}
          onTabChange={setTab}
          contentClassName="hidden"
          tabs={[
            { id: "buy", label: "Buy" },
            {
              id: "purchases",
              label: `Purchases (${wallet?.purchases.length ?? 0})`,
            },
            { id: "wallet", label: "Wallet" },
          ]}
        />

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 24 }}
          className="w-full overflow-hidden rounded-2xl border border-overlay/10 bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between gap-4 border-overlay/10 border-b px-6 py-4">
            <h1 className="font-semibold text-ink-strong tracking-tight">
              Credit Wallet
            </h1>
            {wallet && (
              <Tooltip title={wallet.address} placement="bottom">
                <span className="font-mono text-ink-subtle text-xs">
                  {shortenAddress(wallet.address)}
                </span>
              </Tooltip>
            )}
          </div>

          <AutoHeight>
            {!wallet ? (
              <div className="flex justify-center py-16">
                <Spinner size="lg" className="text-ink-subtle" />
              </div>
            ) : (
              <div className="px-6 pt-5 pb-6">
                <motion.div
                  initial={false}
                  animate={{ opacity: tab === "buy" ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                  className={tab === "buy" ? undefined : "hidden"}
                >
                  <BuyFlow onPurchased={refresh} />
                </motion.div>
                {tab !== "buy" && (
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {tab === "purchases" ? (
                      <Purchases purchases={wallet.purchases} />
                    ) : (
                      <Balance wallet={wallet} onDeposited={refresh} />
                    )}
                  </motion.div>
                )}
              </div>
            )}
          </AutoHeight>
        </motion.div>
      </div>
    </main>
  );
}
