import { useEffect, useMemo, useRef, useState } from "react";

export function useDraft<T extends Record<string, unknown>>(initial: T) {
  const [draft, setDraft] = useState<T>(initial);
  const baseline = useRef(new Map<keyof T, unknown>());

  useEffect(() => {
    setDraft((current) => {
      const next = { ...initial };
      for (const [key, before] of baseline.current) {
        if (initial[key] === before || initial[key] === current[key]) {
          next[key] = current[key];
        } else {
          baseline.current.delete(key);
        }
      }
      return next;
    });
  }, [initial]);

  const set = <K extends keyof T>(key: K, value: T[K]) =>
    setDraft((prev) => {
      if (!baseline.current.has(key) || prev[key] === initial[key]) {
        baseline.current.set(key, initial[key]);
      }
      return { ...prev, [key]: value };
    });

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

  const reset = () => {
    baseline.current.clear();
    setDraft(initial);
  };

  return { draft, set, changes, isDirty, reset };
}
