import { useEffect, useMemo, useState } from "react";

/**
 * Local draft for cards that hold free text. Toggles and selects bypass this
 * and dispatch straight away, so only typed input needs a Save button.
 */
export function useDraft<T extends Record<string, unknown>>(initial: T) {
  const [draft, setDraft] = useState<T>(initial);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resync only when the server copy changes
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const set = <K extends keyof T>(key: K, value: T[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const changes = useMemo(() => {
    const result: Partial<T> = {};
    for (const key of Object.keys(draft) as (keyof T)[]) {
      if (draft[key] !== initial[key]) {
        result[key] = draft[key];
      }
    }
    return result;
  }, [draft, initial]);

  const isDirty = Object.keys(changes).length > 0;

  return { draft, set, changes, isDirty, reset: () => setDraft(initial) };
}
