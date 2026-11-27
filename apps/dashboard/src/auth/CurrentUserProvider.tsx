import { setAuthTokenProvider, setUnauthorizedHandler } from "@api/client";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { fetchConfig } from "@stores/config/actions";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { fetchOrganizations } from "@stores/organization/actions";
import {
  selectActiveOrganizationId,
  selectHasResolvedOrganizations,
} from "@stores/organization/selector";
import {
  selectActiveProjectId,
  selectEnvironment,
  selectHasResolvedProjects,
} from "@stores/project/selector";
import { resetSession } from "@stores/session";
import { fetchUser } from "@stores/user/actions";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { FullScreenLoader } from "@/auth/FullScreenLoader";
import { clearVerifyToken } from "@/lib/verifyToken";

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId, getToken } = useAuth();
  const { signOut } = useClerk();
  const dispatch = useAppDispatch();
  const [tokenReady, setTokenReady] = useState(false);
  const organizationsResolved = useAppSelector(selectHasResolvedOrganizations);
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const projectsResolved = useAppSelector(selectHasResolvedProjects);
  const activeProjectId = useAppSelector(selectActiveProjectId);
  const environment = useAppSelector(selectEnvironment);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  useEffect(() => {
    let signingOut = false;
    setAuthTokenProvider((options) =>
      getTokenRef.current(
        options?.forceRefresh ? { skipCache: true } : undefined,
      ),
    );
    setUnauthorizedHandler(() => {
      if (signingOut) {
        return;
      }
      signingOut = true;
      const { pathname, search } = window.location;
      void signOutRef.current({
        redirectUrl: `/sign-in?redirect_url=${encodeURIComponent(`${pathname}${search}`)}`,
      });
    });
    setTokenReady(true);
    return () => {
      setAuthTokenProvider(null);
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!tokenReady || !isSignedIn || !userId) {
      return;
    }
    dispatch(resetSession());
    dispatch(fetchOrganizations());
    dispatch(fetchUser());
    return () => {
      dispatch(resetSession());
      clearVerifyToken();
    };
  }, [dispatch, isSignedIn, tokenReady, userId]);

  useEffect(() => {
    if (!tokenReady || !isSignedIn) {
      return;
    }
    dispatch(fetchConfig());
    const revalidate = () => {
      if (document.visibilityState === "visible") {
        dispatch(fetchConfig());
      }
    };
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [dispatch, isSignedIn, tokenReady]);

  if (
    !tokenReady ||
    !organizationsResolved ||
    (activeOrganizationId && !projectsResolved)
  ) {
    return <FullScreenLoader />;
  }

  return (
    <Fragment
      key={`${activeOrganizationId ?? "default"}:${activeProjectId ?? "default"}:${environment}`}
    >
      {children}
    </Fragment>
  );
}
