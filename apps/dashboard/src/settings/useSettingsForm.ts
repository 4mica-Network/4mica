import { useEffect, useMemo, useState } from "react";

export function useSettingsForm<T extends Record<string, unknown>>(
  initial: T | null,
) {
  const [draft, setDraft] = useState<T | null>(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const isDirty = useMemo(() => {
    if (!draft || !initial) {
      return false;
    }
    return (Object.keys(draft) as (keyof T)[]).some(
      (key) => draft[key] !== initial[key],
    );
  }, [draft, initial]);

  const set = <K extends keyof T>(key: K, value: T[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  /** Only the fields that actually changed, so PATCH bodies stay minimal. */
  const changes = useMemo(() => {
    if (!draft || !initial) {
      return {} as Partial<T>;
    }
    const result: Partial<T> = {};
    for (const key of Object.keys(draft) as (keyof T)[]) {
      if (draft[key] !== initial[key]) {
        result[key] = draft[key];
      }
    }
    return result;
  }, [draft, initial]);

  const reset = () => setDraft(initial);

  return { draft, set, isDirty, changes, reset };
}
