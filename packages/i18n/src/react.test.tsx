import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import i18next, { type i18n as I18n } from "i18next";
import { lazy, Suspense } from "react";
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import {
  TranslationBoundary,
  TranslationRegistryProvider,
  useTranslationCollections,
  withCollections,
} from "./react";
import { createCollectionRegistry, type Messages } from "./registry";

type Language = "en" | "de";
type Collection = "core" | "wallet" | "help";

const MESSAGES: Record<Language, Record<Collection, Messages>> = {
  en: {
    core: { "nav.home": "Home" },
    wallet: { "wallet.title": "Wallet" },
    help: { "help.title": "Help" },
  },
  de: {
    core: { "nav.home": "Startseite" },
    wallet: { "wallet.title": "Geldbörse" },
    help: { "help.title": "Hilfe" },
  },
};
const GERMAN = new Set(Object.values(MESSAGES.de).flatMap(Object.values));
const ENGLISH = new Set(Object.values(MESSAGES.en).flatMap(Object.values));

const setup = () => {
  const i18n: I18n = i18next.createInstance();
  i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: false,
    keySeparator: false,
    nsSeparator: false,
    partialBundledLanguages: true,
    resources: {},
    interpolation: { escapeValue: false },
    react: { useSuspense: false, bindI18nStore: "added" },
  });
  const releases: Record<string, () => void> = {};
  const registry = createCollectionRegistry<Collection, Language>({
    i18n,
    languages: ["en", "de"],
    collections: ["core", "wallet", "help"],
    loaderFor: (language, collection) => () =>
      new Promise((resolve) => {
        releases[`${language}:${collection}`] = () =>
          resolve({ default: MESSAGES[language][collection] });
      }),
    bundled: { en: { core: MESSAGES.en.core } },
  });
  const release = async (...keys: string[]) => {
    for (const key of keys) {
      await waitFor(() => {
        if (!releases[key]) {
          throw new Error(`${key} was never requested`);
        }
      });
    }
    await act(async () => {
      for (const key of keys) {
        releases[key]();
      }
    });
  };
  const wrap = (ui: React.ReactNode) => (
    <I18nextProvider i18n={i18n}>
      <TranslationRegistryProvider registry={registry}>
        {ui}
      </TranslationRegistryProvider>
    </I18nextProvider>
  );
  return { i18n, registry, release, wrap };
};

afterEach(cleanup);

const mount = async (ui: React.ReactNode) => {
  await act(async () => {
    render(ui);
  });
};

function Shell() {
  const { t } = useTranslation();
  return <span data-testid="shell">{t("nav.home")}</span>;
}

function WalletPage() {
  const { t } = useTranslationCollections(["wallet"]);
  return <span data-testid="wallet">{t("wallet.title")}</span>;
}

function HelpWidget() {
  const { t } = useTranslationCollections(["help"]);
  return <span data-testid="help">{t("help.title")}</span>;
}

describe("TranslationBoundary", () => {
  it("shows the fallback until the collection arrives, then the page", async () => {
    const env = setup();
    await mount(
      env.wrap(
        <TranslationBoundary collections={["wallet"]} fallback={<p>Loading</p>}>
          <WalletPage />
        </TranslationBoundary>,
      ),
    );

    expect(screen.getByText("Loading")).toBeTruthy();

    await env.release("en:wallet");

    expect((await screen.findByTestId("wallet")).textContent).toBe("Wallet");
    expect(screen.queryByText("Loading")).toBeNull();
  });

  it("renders straight away when the collection is already loaded", async () => {
    const env = setup();
    const loading = env.registry.load(["wallet"]);
    await env.release("en:wallet");
    await loading;

    await mount(
      env.wrap(
        <TranslationBoundary collections={["wallet"]} fallback={<p>Loading</p>}>
          <WalletPage />
        </TranslationBoundary>,
      ),
    );

    expect(screen.getByTestId("wallet").textContent).toBe("Wallet");
  });

  it("asks for a provider instead of failing silently", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => render(<WalletPage />)).toThrow(
        /TranslationRegistryProvider/,
      );
    } finally {
      console.error = quiet;
    }
  });
});

describe("switching language on a rendered app", () => {
  it("never renders a mix of languages, and switches every part at once", async () => {
    const env = setup();
    const frames: string[][] = [];
    function Probe() {
      const { t } = useTranslation();
      frames.push([t("nav.home"), t("wallet.title"), t("help.title")]);
      return null;
    }
    await mount(
      env.wrap(
        <>
          <Shell />
          <TranslationBoundary collections={["wallet"]}>
            <WalletPage />
            <TranslationBoundary collections={["help"]}>
              <HelpWidget />
              <Probe />
            </TranslationBoundary>
          </TranslationBoundary>
        </>,
      ),
    );
    await env.release("en:wallet");
    await env.release("en:help");
    expect((await screen.findByTestId("help")).textContent).toBe("Help");

    let switched!: Promise<boolean>;
    act(() => {
      switched = env.registry.changeLanguage("de");
    });
    await env.release("de:core", "de:wallet");

    expect(screen.getByTestId("shell").textContent).toBe("Home");
    expect(screen.getByTestId("wallet").textContent).toBe("Wallet");
    expect(screen.getByTestId("help").textContent).toBe("Help");

    await env.release("de:help");
    await act(async () => {
      await switched;
    });

    expect(screen.getByTestId("shell").textContent).toBe("Startseite");
    expect(screen.getByTestId("wallet").textContent).toBe("Geldbörse");
    expect(screen.getByTestId("help").textContent).toBe("Hilfe");

    for (const frame of frames) {
      const allEnglish = frame.every((text) => ENGLISH.has(text));
      const allGerman = frame.every((text) => GERMAN.has(text));
      expect(allEnglish || allGerman, `mixed frame: ${frame.join(" / ")}`).toBe(
        true,
      );
    }
    expect(frames.at(-1)).toEqual(["Startseite", "Geldbörse", "Hilfe"]);
  });

  it("loads a page opened after the switch in the new language", async () => {
    const env = setup();
    let switched!: Promise<boolean>;
    act(() => {
      switched = env.registry.changeLanguage("de");
    });
    await env.release("de:core");
    await act(async () => {
      await switched;
    });

    await mount(
      env.wrap(
        <TranslationBoundary collections={["help"]}>
          <HelpWidget />
        </TranslationBoundary>,
      ),
    );
    await env.release("de:help");

    expect((await screen.findByTestId("help")).textContent).toBe("Hilfe");
  });
});

describe("withCollections", () => {
  it("resolves a lazy page only once its translations are registered", async () => {
    const env = setup();
    let resolvePage!: (value: { default: typeof WalletPage }) => void;
    const Page = lazy(
      withCollections(
        env.registry,
        () =>
          new Promise<{ default: typeof WalletPage }>((resolve) => {
            resolvePage = resolve;
          }),
        ["wallet"],
      ),
    );
    await mount(
      env.wrap(
        <Suspense fallback={<p>Loading</p>}>
          <Page />
        </Suspense>,
      ),
    );

    await act(async () => {
      resolvePage({ default: WalletPage });
    });
    expect(screen.getByText("Loading")).toBeTruthy();

    await env.release("en:wallet");

    expect((await screen.findByTestId("wallet")).textContent).toBe("Wallet");
  });
});
