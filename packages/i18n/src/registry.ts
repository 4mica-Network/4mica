import type { i18n as I18n } from "i18next";

export type Messages = Record<string, string>;

export type MessagesLoader = () => Promise<Messages | { default: Messages }>;

export interface CollectionRegistryOptions<
  Collection extends string,
  Language extends string,
> {
  i18n: I18n;
  languages: readonly Language[];
  collections: readonly Collection[];
  loaderFor: (
    language: Language,
    collection: Collection,
  ) => MessagesLoader | undefined;
  bundled?: Partial<Record<Language, Partial<Record<Collection, Messages>>>>;
  namespace?: string;
}

export interface CollectionRegistry<
  Collection extends string,
  Language extends string,
> {
  readonly languages: readonly Language[];
  readonly collections: readonly Collection[];
  language(): Language;
  isLanguage(value: unknown): value is Language;
  isLoaded(collections: readonly Collection[], language?: Language): boolean;
  load(collections: readonly Collection[], language?: Language): Promise<void>;
  changeLanguage(language: Language): Promise<boolean>;
  requested(): Collection[];
}

export class UnknownCollectionError extends Error {
  constructor(language: string, collection: string) {
    super(`No "${collection}" translations for "${language}"`);
    this.name = "UnknownCollectionError";
  }
}

const unwrap = (module: Messages | { default: Messages }): Messages =>
  "default" in module && typeof module.default === "object"
    ? (module.default as Messages)
    : (module as Messages);

export function createCollectionRegistry<
  Collection extends string,
  Language extends string,
>({
  i18n,
  languages,
  collections,
  loaderFor,
  bundled = {},
  namespace = "translation",
}: CollectionRegistryOptions<Collection, Language>): CollectionRegistry<
  Collection,
  Language
> {
  const loaded = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();
  const requested = new Set<Collection>();
  let switchRequest = 0;

  const slot = (language: Language, collection: Collection) =>
    `${language}:${collection}`;

  const isLanguage = (value: unknown): value is Language =>
    languages.includes(value as Language);

  const language = (): Language =>
    isLanguage(i18n.language) ? i18n.language : languages[0];

  for (const [lng, bundles] of Object.entries(bundled) as [
    Language,
    Partial<Record<Collection, Messages>>,
  ][]) {
    for (const [collection, messages] of Object.entries(bundles) as [
      Collection,
      Messages,
    ][]) {
      i18n.addResourceBundle(lng, namespace, messages, true, true);
      loaded.add(slot(lng, collection));
      requested.add(collection);
    }
  }

  const loadOne = (lng: Language, collection: Collection): Promise<void> => {
    const key = slot(lng, collection);
    if (loaded.has(key)) {
      return Promise.resolve();
    }
    const pending = inFlight.get(key);
    if (pending) {
      return pending;
    }
    const loader = loaderFor(lng, collection);
    if (!loader) {
      return Promise.reject(new UnknownCollectionError(lng, collection));
    }
    const task = loader()
      .then((module) => {
        i18n.addResourceBundle(lng, namespace, unwrap(module), true, true);
        loaded.add(key);
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, task);
    return task;
  };

  const isLoaded = (
    wanted: readonly Collection[],
    lng: Language = language(),
  ): boolean => wanted.every((collection) => loaded.has(slot(lng, collection)));

  const load = async (
    wanted: readonly Collection[],
    lng: Language = language(),
  ): Promise<void> => {
    for (const collection of wanted) {
      requested.add(collection);
    }
    await Promise.all(wanted.map((collection) => loadOne(lng, collection)));
  };

  const changeLanguage = async (next: Language): Promise<boolean> => {
    const request = ++switchRequest;
    let missing = [...requested].filter(
      (collection) => !loaded.has(slot(next, collection)),
    );
    while (missing.length > 0) {
      await Promise.all(missing.map((collection) => loadOne(next, collection)));
      if (request !== switchRequest) {
        return false;
      }
      missing = [...requested].filter(
        (collection) => !loaded.has(slot(next, collection)),
      );
    }
    if (request !== switchRequest) {
      return false;
    }
    if (i18n.language !== next) {
      await i18n.changeLanguage(next);
    }
    return request === switchRequest;
  };

  return {
    languages,
    collections,
    language,
    isLanguage,
    isLoaded,
    load,
    changeLanguage,
    requested: () => [...requested],
  };
}

export function loadersFromGlob<
  Collection extends string,
  Language extends string,
>(
  modules: Record<string, () => Promise<unknown>>,
): (language: Language, collection: Collection) => MessagesLoader | undefined {
  const table = new Map<string, MessagesLoader>();
  for (const [path, load] of Object.entries(modules)) {
    const match = path.match(/([^/]+)\/([^/]+)\.json$/);
    if (match) {
      table.set(`${match[1]}:${match[2]}`, load as MessagesLoader);
    }
  }
  return (language, collection) => table.get(`${language}:${collection}`);
}
