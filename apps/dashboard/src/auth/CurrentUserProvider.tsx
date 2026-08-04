import { useAuth } from "@clerk/clerk-react";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { useApi } from "@/lib/api";

export interface CurrentUser {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface CurrentUserState {
  user: CurrentUser | null;
  isLoading: boolean;
  error: Error | null;
}

const CurrentUserContext = createContext<CurrentUserState>({
  user: null,
  isLoading: false,
  error: null,
});

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId } = useAuth();
  const api = useApi();
  const apiRef = useRef(api);
  apiRef.current = api;

  const [state, setState] = useState<CurrentUserState>({
    user: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!isSignedIn || !userId) {
      setState({ user: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    apiRef
      .current<CurrentUser>("/me")
      .then((user) => {
        if (!cancelled) {
          setState({ user, isLoading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            user: null,
            isLoading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

  return <CurrentUserContext value={state}>{children}</CurrentUserContext>;
}

export function useCurrentUser(): CurrentUserState {
  return use(CurrentUserContext);
}
