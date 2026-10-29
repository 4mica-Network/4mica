"use client";

import { Spinner, Tooltip } from "@4mica/ui";
import { motion } from "framer-motion";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Row, shortenAddress } from "@/components/ui";

interface ShopView {
  name: string;
  summary: string | null;
  priceLabel: string;
  payTo: string;
}

export default function ShopPage() {
  const [shop, setShop] = useState<ShopView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    setEndpoint(`${location.origin}/insight`);
    fetch("/api/shop")
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        setShop(await res.json());
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 24 }}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-overlay/10 bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-overlay/10 border-b px-6 py-4">
          <h1 className="font-semibold text-ink-strong tracking-tight">
            Insight Store
          </h1>
          {shop && (
            <Tooltip title={shop.payTo} placement="bottom">
              <span className="font-mono text-ink-subtle text-xs">
                {shortenAddress(shop.payTo)}
              </span>
            </Tooltip>
          )}
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <TriangleAlert className="h-5 w-5 text-danger" />
            <p className="font-medium text-ink-strong text-sm">
              Couldn't open the shop
            </p>
            <p className="text-ink-muted text-sm">{error}</p>
          </div>
        ) : !shop ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" className="text-ink-subtle" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-6 px-6 pt-5 pb-6"
          >
            <div className="text-center">
              <p className="text-ink-subtle text-xs uppercase tracking-wide">
                Price per request
              </p>
              <p className="mt-1 font-mono font-semibold text-3xl text-ink-strong tabular-nums">
                {shop.priceLabel}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-overlay/10 border-y border-dashed py-4">
              <Row label="Product">{shop.name}</Row>
              {shop.summary && <Row label="About">{shop.summary}</Row>}
              <Row label="Endpoint">
                <Tooltip title={endpoint} placement="bottom">
                  <span className="font-mono text-xs">GET /insight</span>
                </Tooltip>
              </Row>
            </div>
          </motion.div>
        )}
      </motion.div>
    </main>
  );
}
