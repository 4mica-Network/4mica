"use client";

import dynamic from "next/dynamic";

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
