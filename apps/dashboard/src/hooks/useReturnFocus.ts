import { useEffect, useRef } from "react";

export const useReturnFocus = <T extends HTMLElement = HTMLButtonElement>(
  isOpen: boolean,
) => {
  const target = useRef<T>(null);
  const wasOpen = useRef(isOpen);

  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      target.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  return target;
};
