import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { checkUsername, resetUsernameCheck } from "@stores/user/actions";
import { selectUsernameCheck } from "@stores/user/selector";
import type { UsernameStatus } from "@stores/user/type";
import { useDebounceEffect } from "ahooks";
import { useEffect } from "react";
import { isUsernameShapeValid } from "@/components/Onboarding/validation";

export const useUsernameAvailability = (
  candidate: string,
  savedUsername: string,
): UsernameStatus => {
  const dispatch = useAppDispatch();
  const check = useAppSelector(selectUsernameCheck);

  useEffect(() => {
    return () => {
      dispatch(resetUsernameCheck());
    };
  }, [dispatch]);

  useDebounceEffect(
    () => {
      if (!isUsernameShapeValid(candidate) || candidate === savedUsername) {
        return;
      }
      dispatch(checkUsername(candidate));
    },
    [candidate, savedUsername],
    { wait: 450 },
  );

  return check.value === candidate ? check.status : "idle";
};
