import {
  createContext,
  type ReactNode,
  Suspense,
  use,
  useContext,
} from "react";
import { type UseTranslationResponse, useTranslation } from "react-i18next";
import type { CollectionRegistry } from "./registry";

type AnyRegistry = CollectionRegistry<string, string>;

const RegistryContext = createContext<AnyRegistry | null>(null);

export function TranslationRegistryProvider({
  registry,
  children,
}: {
  registry: AnyRegistry;
  children: ReactNode;
}) {
  return <RegistryContext value={registry}>{children}</RegistryContext>;
}

const pendingByRegistry = new WeakMap<
  AnyRegistry,
  Map<string, Promise<void>>
>();

const ready = (
  registry: AnyRegistry,
  collections: readonly string[],
  language: string,
): Promise<void> => {
  let pending = pendingByRegistry.get(registry);
  if (!pending) {
    pending = new Map();
    pendingByRegistry.set(registry, pending);
  }
  const key = `${language}:${[...collections].sort().join(",")}`;
  const existing = pending.get(key);
  if (existing) {
    return existing;
  }
  const task = registry.load(collections, language).finally(() => {
    pending.delete(key);
  });
  pending.set(key, task);
  return task;
};

export function useTranslationCollections<Collection extends string>(
  collections: readonly Collection[],
): UseTranslationResponse<"translation", undefined> {
  const registry = useContext(RegistryContext);
  if (!registry) {
    throw new Error(
      "useTranslationCollections needs a TranslationRegistryProvider above it",
    );
  }
  const translation = useTranslation();
  const language = registry.language();
  if (!registry.isLoaded(collections, language)) {
    use(ready(registry, collections, language));
  }
  return translation;
}

function CollectionGate<Collection extends string>({
  collections,
  children,
}: {
  collections: readonly Collection[];
  children: ReactNode;
}) {
  useTranslationCollections(collections);
  return children;
}

export function TranslationBoundary<Collection extends string>({
  collections,
  fallback = null,
  children,
}: {
  collections: readonly Collection[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={fallback}>
      <CollectionGate collections={collections}>{children}</CollectionGate>
    </Suspense>
  );
}

export const withCollections =
  <Collection extends string, Language extends string, Value>(
    registry: CollectionRegistry<Collection, Language>,
    load: () => Promise<Value>,
    collections: readonly Collection[],
  ) =>
  (): Promise<Value> =>
    Promise.all([load(), registry.load(collections)]).then(([value]) => value);
