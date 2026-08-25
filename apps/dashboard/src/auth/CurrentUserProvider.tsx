import { setAuthTokenProvider } from "@api/client";
import { useAuth } from "@clerk/clerk-react";
import { useAppDispatch } from "@stores/hooks";
import { fetchUser } from "@stores/user/actions";
import { type ReactNode, useEffect, useRef, useState } from "react";

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

  return <>{children}</>;
}
