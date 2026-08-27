import { createContext, useContext } from "react";

/**
 * Its own module so `Tab` and `TabGroup` can both reach it without importing
 * each other. The cycle they would otherwise form defeats tsup's code
 * splitting: esbuild inlines the pair into the barrel entry, and
 * scripts/preserve-use-client then stamps `"use client"` on dist/index.js,
 * dragging every server-safe export into the client graph.
 */
export interface TabContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

export const TabContext = createContext<TabContextValue | null>(null);

export const useTabContext = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error("Tab must be used within a TabGroup");
  }
  return context;
};
