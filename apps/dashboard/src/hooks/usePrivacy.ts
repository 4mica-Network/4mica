import { useAppSelector } from "@stores/hooks";
import { selectUser } from "@stores/user/selector";
import { useCallback } from "react";

export const MASK = "••••";

export const usePrivacy = () => {
  const hidden = useAppSelector(selectUser)?.privacyMode ?? false;
  const mask = useCallback(
    (value: string) => (hidden ? MASK : value),
    [hidden],
  );
  return { hidden, mask };
};
