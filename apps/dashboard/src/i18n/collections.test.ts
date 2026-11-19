import { describe, expect, it } from "vitest";
import { COLLECTIONS, SUPPORTED_LANGUAGES } from "./index";
import { collectionFile, localeFiles } from "./testCatalogues";

const pluralExtras = (language: string) =>
  new Intl.PluralRules(language)
    .resolvedOptions()
    .pluralCategories.filter((form) => form !== "one" && form !== "other");

describe("translation collections", () => {
  it("has one file per collection per language and nothing else", () => {
    const expected = SUPPORTED_LANGUAGES.flatMap((language) =>
      COLLECTIONS.map(
        (collection) => `./locales/${language}/${collection}.json`,
      ),
    );

    expect(localeFiles().sort()).toEqual(expected.sort());
  });

  it("files every key under the same collection in every language", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const collection of COLLECTIONS) {
        const english = Object.keys(collectionFile("en", collection) ?? {});
        const expected = english.flatMap((key) =>
          key.endsWith("_other")
            ? [
                key,
                ...pluralExtras(language).map((form) =>
                  key.replace(/_other$/, `_${form}`),
                ),
              ]
            : [key],
        );

        expect(
          Object.keys(collectionFile(language, collection) ?? {}),
          `${language}/${collection}`,
        ).toEqual(expected);
      }
    }
  });

  it("puts each key in exactly one collection", () => {
    const owners = new Map<string, string[]>();
    for (const collection of COLLECTIONS) {
      for (const key of Object.keys(collectionFile("en", collection) ?? {})) {
        owners.set(key, [...(owners.get(key) ?? []), collection]);
      }
    }
    const shared = [...owners].filter(
      ([, collections]) => collections.length > 1,
    );

    expect(shared).toEqual([]);
  });
});
