# @4mica/i18n

Translations that load on demand. An app splits its catalogue into
**collections** (one JSON file per collection per language), and the
registry fetches a collection the first time something needs it, in the
language in use, then registers it into the app's i18next instance.

## Set up

```ts
import { createCollectionRegistry, loadersFromGlob } from "@4mica/i18n";
import core from "./locales/en/core.json";

export const translations = createCollectionRegistry<Collection, Language>({
  i18n,
  languages: ["en", "de", "fr", "es"],
  collections: ["core", "wallet", "help"],
  loaderFor: loadersFromGlob(
    import.meta.glob(["./locales/*/*.json", "!./locales/en/core.json"]),
  ),
  bundled: { en: { core } },
});
```

Files live at `locales/<language>/<collection>.json`. Bundle only what the
first screen needs; everything else is a separate chunk per language.

## Load what a page needs

- `withCollections(registry, load, collections)` wraps a lazy import so the
  module and its translations download in parallel. Use it with `React.lazy`
  for routes and lazy components.
- `<TranslationBoundary collections fallback>` suspends its children until
  the collections are registered.
- `useTranslationCollections(collections)` does the same from inside a
  component and returns `useTranslation()`'s result.

Wrap the app in `<TranslationRegistryProvider registry>` for the last two.

## Switch language

`registry.changeLanguage(language)` first loads, in the new language, every
collection requested so far, including any requested while the switch is
in flight, and only then switches i18next. Every mounted component changes
language in the same render, so nothing shows a mix of languages. When two
switches overlap, the later one wins and the earlier resolves `false`.
