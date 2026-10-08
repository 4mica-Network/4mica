import { useEffect, useRef } from "react";

export const useOnSuccess = (
  pending: boolean,
  failed: boolean,
  onSuccess: () => void,
): void => {
  const wasPending = useRef(pending);
  const callback = useRef(onSuccess);
  callback.current = onSuccess;

  useEffect(() => {
    if (wasPending.current && !pending && !failed) {
      callback.current();
    }
    wasPending.current = pending;
  }, [pending, failed]);
};
