import { setAuthTokenProvider } from "@api/client";
import { useAuth } from "@clerk/clerk-react";
import { useAppDispatch } from "@stores/hooks";
import { fetchUser } from "@stores/user/actions";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FullScreenLoader } from "@/auth/FullScreenLoader";

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId, getToken } = useAuth();
  const dispatch = useAppDispatch();
  const [tokenReady, setTokenReady] = useState(false);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    setAuthTokenProvider(() => getTokenRef.current());
    setTokenReady(true);
    return () => {
      setAuthTokenProvider(null);
    };
  }, []);

  useEffect(() => {
    if (tokenReady && isSignedIn && userId) {
      dispatch(fetchUser());
    }
  }, [dispatch, isSignedIn, tokenReady, userId]);

  /**
   * Children do not mount until the token provider is installed.
   *
   * React runs child effects before parent effects, so any page that fetches
   * on mount would otherwise fire before the effect above — sending a request
   * with no Authorization header and getting back a 401 that has nothing to do
   * with the user's actual session. Holding the subtree for one frame is the
   * difference between "loading" and a spurious auth error on every such page.
   */
  if (!tokenReady) {
    return <FullScreenLoader messageKey="auth.loading" />;
  }

  return <>{children}</>;
}
