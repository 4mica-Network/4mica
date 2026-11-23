import type { LazyReducers } from "@stores/index";
import type { Watchers } from "./rootSaga";

export type LazyStoreName = keyof LazyReducers;

export interface LazyStore<K extends LazyStoreName = LazyStoreName> {
  name: K;
  reducer: LazyReducers[K];
  watchers: Watchers;
}

type Listener = (entry: LazyStore) => void;

const registered = new Map<LazyStoreName, LazyStore>();
let listener: Listener | null = null;

export const registerStore = <K extends LazyStoreName>(
  name: K,
  reducer: LazyReducers[K],
  watchers: Watchers,
) => {
  if (registered.has(name)) {
    return;
  }
  const entry = { name, reducer, watchers } as LazyStore;
  registered.set(name, entry);
  listener?.(entry);
};

export const onStoreRegistered = (next: Listener) => {
  listener = next;
  for (const entry of registered.values()) {
    next(entry);
  }
};
