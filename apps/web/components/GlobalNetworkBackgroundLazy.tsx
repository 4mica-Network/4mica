"use client";

import dynamic from "next/dynamic";

// The network background is a decorative, purely client-side canvas animation.
// Loading it via next/dynamic({ ssr: false }) splits it into its own chunk and
// defers evaluation until after first paint, keeping it out of the critical
// bundle. A matching `bg-surface-deep` placeholder renders immediately so the
// deep background is present with no flash before the chunk loads.
const GlobalNetworkBackground = dynamic(
  () => import("./GlobalNetworkBackground"),
  {
    ssr: false,
    loading: () => <div className="bg-surface-deep" aria-hidden="true" />,
  },
);

export default function GlobalNetworkBackgroundLazy() {
  return <GlobalNetworkBackground />;
}
