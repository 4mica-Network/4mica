import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DashboardClient } from "../data/client";
import { liveClient, resolveMode } from "../data/live-client";
import { mockClient } from "../data/mock-client";

interface DashboardContextValue {
  client: DashboardClient;
  /** Bumps after any mutation so subscribed views refetch. */
  revision: number;
  refresh: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const client = useMemo<DashboardClient>(
    () =>
      resolveMode() === "live"
        ? liveClient(import.meta.env.VITE_4MICA_API_URL ?? "")
        : mockClient(),
    [],
  );
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  const value = useMemo(
    () => ({ client, revision, refresh }),
    [client, revision, refresh],
  );
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx)
    throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
}

/** Load data from the client, refetching whenever `revision` changes. */
export function useCollection<T>(
  load: (c: DashboardClient) => Promise<T>,
): AsyncState<T> {
  const { client, revision } = useDashboard();
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    loading: true,
    error: undefined,
  });

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    load(client)
      .then((data) => {
        if (active) setState({ data, loading: false, error: undefined });
      })
      .catch((e: unknown) => {
        if (active)
          setState({
            data: undefined,
            loading: false,
            error: (e as Error).message,
          });
      });
    return () => {
      active = false;
    };
    // `load` is a fresh closure each render; client + revision drive refetch.
  }, [client, revision]);

  return state;
}
