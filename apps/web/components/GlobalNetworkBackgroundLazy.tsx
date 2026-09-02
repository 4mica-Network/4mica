"use client";

import dynamic from "next/dynamic";

const GlobalNetworkBackground = dynamic(
  () => import("./GlobalNetworkBackground"),
  {
    ssr: false,
    loading: () => <div className="global-background" aria-hidden="true" />,
  },
);

export default function GlobalNetworkBackgroundLazy() {
  return <GlobalNetworkBackground />;
}
