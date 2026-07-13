import type { DashboardClient } from "./client";

export function liveClient(_baseUrl: string): DashboardClient {
  const notReady = () => {
    throw new Error(
      "Live mode is not available yet — run the dashboard in sandbox mode.",
    );
  };
  return {
    mode: "live",
    listAgents: notReady,
    getAgent: notReady,
    addAgent: notReady,
    removeAgent: notReady,
    publishAgent: notReady,
    listTransactions: notReady,
    listWhitelist: notReady,
    setWhitelisted: notReady,
  };
}

/** Resolve the active client from Vite env (defaults to sandbox). */
export function resolveMode(): "sandbox" | "live" {
  return import.meta.env.VITE_4MICA_MODE === "live" ? "live" : "sandbox";
}
