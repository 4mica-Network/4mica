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
import { signInPath } from "@/auth/accessHandling";
import { FullScreenLoader } from "@/auth/FullScreenLoader";
import { useSecurityBridges } from "@/auth/useSecurityBridges";
import { accessErrorFromBody } from "@/lib/accessErrors";
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

  const signingOut = useRef(false);
  const signOutTo = useRef((redirectUrl: string) => {
    if (signingOut.current) {
      return;
    }
    signingOut.current = true;
    void signOutRef.current({ redirectUrl });
  }).current;

  useSecurityBridges(signOutTo);

  useEffect(() => {
    setAuthTokenProvider((options) =>
      getTokenRef.current(
        options?.forceRefresh ? { skipCache: true } : undefined,
      ),
    );
    setUnauthorizedHandler((body) => {
      const tooOld = accessErrorFromBody(body)?.code === "session_too_old";
      signOutTo(signInPath({ reason: tooOld ? "session_too_old" : null }));
    });
    setTokenReady(true);
    return () => {
      setAuthTokenProvider(null);
      setUnauthorizedHandler(null);
    };
  }, [signOutTo]);

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
