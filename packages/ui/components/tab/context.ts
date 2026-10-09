import { createContext, useContext } from "react";

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
