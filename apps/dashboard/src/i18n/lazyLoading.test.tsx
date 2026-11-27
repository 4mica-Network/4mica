import {
  createCollectionRegistry,
  loadersFromGlob,
  TranslationRegistryProvider,
  useTranslationCollections,
  withCollections,
} from "@4mica/i18n";
import { act, cleanup, render, screen } from "@testing-library/react";
import i18next, { type i18n as I18n } from "i18next";
import { lazy, type ReactNode, Suspense } from "react";
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import {
  COLLECTIONS,
  type Collection,
  type Language,
  SUPPORTED_LANGUAGES,
} from "./index";
import { LAZY_TRANSLATIONS } from "./manifest";
import { catalogue, collectionFile } from "./testCatalogues";

const fresh = () => {
  const i18n: I18n = i18next.createInstance();
  i18n.use(initReactI18next).init({
    resources: {},
    partialBundledLanguages: true,
    lng: "en",
    fallbackLng: false,
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false, bindI18nStore: "added" },
  });
  const fetched: string[] = [];
  const loaders = loadersFromGlob<Collection, Language>(
    import.meta.glob(["./locales/*/*.json", "!./locales/en/core.json"]),
  );
  const registry = createCollectionRegistry<Collection, Language>({
    i18n,
    languages: SUPPORTED_LANGUAGES,
    collections: COLLECTIONS,
    loaderFor: (language, collection) => {
      const load = loaders(language, collection);
      return (
        load &&
        (() => {
          fetched.push(`${language}:${collection}`);
          return load();
        })
      );
    },
    bundled: { en: { core: collectionFile("en", "core") } },
  });
  return { i18n, registry, fetched };
};

const firstKey = (collection: Collection) =>
  Object.keys(collectionFile("en", collection) ?? {})[0];

afterEach(cleanup);

describe("translations load on demand", () => {
  it("starts with only the English core collection", () => {
    const { i18n, registry, fetched } = fresh();
    const pageKey = firstKey("wallet");

    expect(registry.isLoaded(["core"])).toBe(true);
    expect(i18n.t("nav.payments")).toBe(catalogue("en")["nav.payments"]);
    expect(i18n.t(pageKey)).toBe(pageKey);
    expect(fetched).toEqual([]);
  });

  it("fetches a page's collections, in the language in use, when the page opens", async () => {
    const { i18n, registry, fetched } = fresh();
    await registry.changeLanguage("de");
    expect(fetched).toEqual(["de:core"]);

    await withCollections(
      registry,
      async () => "help page",
      LAZY_TRANSLATIONS["pages/help"],
    )();

    expect(fetched).toEqual(["de:core", "de:help"]);
    expect(registry.isLoaded(["help"], "en")).toBe(false);
    const key = firstKey("help");
    expect(i18n.t(key)).toBe(catalogue("de")[key]);
  });

  it("loads every collection in every language", async () => {
    const { i18n, registry } = fresh();
    for (const language of SUPPORTED_LANGUAGES) {
      await registry.load(COLLECTIONS, language);
      const expected = catalogue(language);
      for (const key of Object.keys(expected)) {
        expect(i18n.t(key, { lng: language, count: 2 }), key).not.toBe(key);
      }
    }
  });
});

describe("switching language in the app", () => {
  const ENGLISH = catalogue("en");
  const FRENCH = catalogue("fr");
  const shellKey = "nav.payments";
  const pageKeys = ["wallet.toolbar.searchPlaceholder", "page.wallet.title"];

  function Shell() {
    const { t } = useTranslation();
    return <nav data-testid="shell">{t(shellKey)}</nav>;
  }

  it("shows one language at a time, shell and page together", async () => {
    const { i18n, registry } = fresh();
    const frames: string[][] = [];

    function WalletPage() {
      const { t } = useTranslationCollections(["wallet"]);
      const texts = [t(shellKey), ...pageKeys.map((key) => t(key))];
      frames.push(texts);
      return <main data-testid="page">{texts.slice(1).join(" | ")}</main>;
    }
    const Page = lazy(
      withCollections(
        registry,
        async () => ({ default: WalletPage }),
        LAZY_TRANSLATIONS["pages/wallet"],
      ),
    );
    const app: ReactNode = (
      <I18nextProvider i18n={i18n}>
        <TranslationRegistryProvider registry={registry}>
          <Shell />
          <Suspense fallback={<p>Loading</p>}>
            <Page />
          </Suspense>
        </TranslationRegistryProvider>
      </I18nextProvider>
    );

    await act(async () => {
      render(app);
    });
    expect((await screen.findByTestId("page")).textContent).toBe(
      pageKeys.map((key) => ENGLISH[key]).join(" | "),
    );

    await act(async () => {
      await registry.changeLanguage("fr");
    });

    expect(screen.getByTestId("shell").textContent).toBe(FRENCH[shellKey]);
    expect(screen.getByTestId("page").textContent).toBe(
      pageKeys.map((key) => FRENCH[key]).join(" | "),
    );

    const keys = [shellKey, ...pageKeys];
    for (const frame of frames) {
      const english = frame.every((text, i) => text === ENGLISH[keys[i]]);
      const french = frame.every((text, i) => text === FRENCH[keys[i]]);
      expect(english || french, `mixed frame: ${frame.join(" / ")}`).toBe(true);
    }
  });

  it("opens a page after a switch straight in the new language", async () => {
    const { i18n, registry, fetched } = fresh();
    await registry.changeLanguage("es");

    function HelpPage() {
      const { t } = useTranslationCollections(["help"]);
      return <main data-testid="help">{t(firstKey("help"))}</main>;
    }
    await act(async () => {
      render(
        <I18nextProvider i18n={i18n}>
          <TranslationRegistryProvider registry={registry}>
            <Suspense fallback={<p>Loading</p>}>
              <HelpPage />
            </Suspense>
          </TranslationRegistryProvider>
        </I18nextProvider>,
      );
    });

    expect((await screen.findByTestId("help")).textContent).toBe(
      catalogue("es")[firstKey("help")],
    );
    expect(fetched).not.toContain("en:help");
  });
});
