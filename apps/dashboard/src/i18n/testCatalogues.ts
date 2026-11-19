import { COLLECTIONS, type Collection, type Language } from "@/i18n";

const files = import.meta.glob<Record<string, string>>("./locales/*/*.json", {
  eager: true,
  import: "default",
});

export const collectionFile = (
  language: Language,
  collection: Collection,
): Record<string, string> | undefined =>
  files[`./locales/${language}/${collection}.json`];

export const localeFiles = (): string[] => Object.keys(files);

export const catalogue = (language: Language): Record<string, string> =>
  Object.assign(
    {},
    ...COLLECTIONS.map((collection) => collectionFile(language, collection)),
  );
