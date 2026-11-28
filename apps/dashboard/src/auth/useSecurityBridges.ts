import { useClerk, useReverification } from "@clerk/clerk-react";
import { isReverificationCancelledError } from "@clerk/clerk-react/errors";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { switchOrganization } from "@stores/organization/actions";
import {
  selectActiveOrganization,
  selectPersonalOrganization,
} from "@stores/organization/selector";
import { useEffect, useRef } from "react";
import { setAccessErrorHandler } from "@/lib/accessErrors";
import { setReverifier } from "@/lib/reauth";
import { handleAccessError } from "./accessHandling";

export const REVERIFICATION_HINT = {
  clerk_error: {
    type: "forbidden",
    reason: "reverification-error",
    metadata: {
      reverification: { level: "multi_factor", afterMinutes: 10 },
    },
  },
} as const;

interface Attempt {
  asked: boolean;
}

const askOnce = async (attempt: Attempt) => {
  if (attempt.asked) {
    return true;
  }
  attempt.asked = true;
  return REVERIFICATION_HINT;
};

export function useSecurityBridges(signOutTo: (path: string) => void) {
  const dispatch = useAppDispatch();
  const clerk = useClerk();
  const reverify = useReverification(askOnce);
  const personal = useAppSelector(selectPersonalOrganization);
  const active = useAppSelector(selectActiveOrganization);

  const latest = useRef({ signOutTo, clerk, personal, active, dispatch });
  latest.current = { signOutTo, clerk, personal, active, dispatch };

  useEffect(() => {
    setReverifier(async () => {
      try {
        return (await reverify({ asked: false })) === true;
      } catch (error) {
        if (isReverificationCancelledError(error)) {
          return false;
        }
        throw error;
      }
    });
    return () => setReverifier(null);
  }, [reverify]);

  useEffect(() => {
    setAccessErrorHandler((access) =>
      handleAccessError(access, {
        signOutTo: (path) => latest.current.signOutTo(path),
        openUserProfile: () => latest.current.clerk.openUserProfile(),
        personalOrganizationId: () => latest.current.personal?.id ?? null,
        activeOrganizationIsPersonal: () =>
          Boolean(latest.current.active?.personal),
        switchOrganization: (id) =>
          latest.current.dispatch(switchOrganization(id)),
      }),
    );
    return () => setAccessErrorHandler(null);
  }, []);
}
