import i18next, { type i18n as I18n } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCollectionRegistry,
  loadersFromGlob,
  type Messages,
  UnknownCollectionError,
} from "./registry";

type Language = "en" | "de" | "fr";
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
  fr: {
    core: { "nav.home": "Accueil" },
    wallet: { "wallet.title": "Portefeuille" },
    help: { "help.title": "Aide" },
  },
};

interface Gate {
  calls: number;
  open: () => void;
  fail: (error: Error) => void;
}

const setup = (options: { manual?: boolean } = {}) => {
  const i18n: I18n = i18next.createInstance();
  i18n.init({
    lng: "en",
    fallbackLng: false,
    keySeparator: false,
    nsSeparator: false,
    partialBundledLanguages: true,
    resources: {},
    interpolation: { escapeValue: false },
  });
  const gates = new Map<string, Gate>();
  const loaderFor = (language: Language, collection: Collection) => {
    const messages = MESSAGES[language]?.[collection];
    if (!messages) {
      return undefined;
    }
    return () => {
      const key = `${language}:${collection}`;
      const gate = gates.get(key) ?? {
        calls: 0,
        open: () => {},
        fail: () => {},
      };
      gate.calls += 1;
      gates.set(key, gate);
      if (!options.manual) {
        return Promise.resolve({ default: messages });
      }
      return new Promise<{ default: Messages }>((resolve, reject) => {
        gate.open = () => resolve({ default: messages });
        gate.fail = reject;
      });
    };
  };
  const registry = createCollectionRegistry<Collection, Language>({
    i18n,
    languages: ["en", "de", "fr"],
    collections: ["core", "wallet", "help"],
    loaderFor,
    bundled: { en: { core: MESSAGES.en.core } },
  });
  const gate = (key: string) => {
    const found = gates.get(key);
    if (!found) {
      throw new Error(`${key} was never requested`);
    }
    return found;
  };
  return { i18n, registry, gate, gates };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("collection registry", () => {
  let env: ReturnType<typeof setup>;

  beforeEach(() => {
    env = setup();
  });

  it("serves bundled collections without loading them", () => {
    expect(env.registry.isLoaded(["core"])).toBe(true);
    expect(env.i18n.t("nav.home")).toBe("Home");
    expect(env.registry.requested()).toEqual(["core"]);
    expect(env.gates.size).toBe(0);
  });

  it("loads a collection into the shared namespace on demand", async () => {
    expect(env.registry.isLoaded(["wallet"])).toBe(false);

    await env.registry.load(["wallet"]);

    expect(env.registry.isLoaded(["wallet"])).toBe(true);
    expect(env.i18n.t("wallet.title")).toBe("Wallet");
    expect(env.i18n.t("nav.home")).toBe("Home");
  });

  it("fetches a collection once however many callers ask at the same time", async () => {
    await Promise.all([
      env.registry.load(["wallet"]),
      env.registry.load(["wallet", "help"]),
      env.registry.load(["wallet"]),
    ]);
    await env.registry.load(["wallet"]);

    expect(env.gate("en:wallet").calls).toBe(1);
    expect(env.gate("en:help").calls).toBe(1);
  });

  it("rejects an unknown collection without marking it loaded", async () => {
    await expect(
      env.registry.load(["missing" as Collection]),
    ).rejects.toBeInstanceOf(UnknownCollectionError);
    expect(env.registry.isLoaded(["missing" as Collection])).toBe(false);
  });

  it("retries a collection whose load failed", async () => {
    const manual = setup({ manual: true });
    const first = manual.registry.load(["wallet"]);
    manual.gate("en:wallet").fail(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    expect(manual.registry.isLoaded(["wallet"])).toBe(false);

    const second = manual.registry.load(["wallet"]);
    manual.gate("en:wallet").open();
    await second;

    expect(manual.gate("en:wallet").calls).toBe(2);
    expect(manual.i18n.t("wallet.title")).toBe("Wallet");
  });
});

describe("switching language", () => {
  it("loads every requested collection before switching, so nothing shows mixed", async () => {
    const env = setup({ manual: true });
    const loading = env.registry.load(["wallet"]);
    env.gate("en:wallet").open();
    await loading;

    const switching = env.registry.changeLanguage("de");
    await settle();
    env.gate("de:core").open();
    await settle();

    expect(env.i18n.language).toBe("en");
    expect(env.i18n.t("nav.home")).toBe("Home");
    expect(env.i18n.t("wallet.title")).toBe("Wallet");

    env.gate("de:wallet").open();
    await expect(switching).resolves.toBe(true);

    expect(env.i18n.language).toBe("de");
    expect(env.i18n.t("nav.home")).toBe("Startseite");
    expect(env.i18n.t("wallet.title")).toBe("Geldbörse");
  });

  it("includes a collection a page requests while the switch is in flight", async () => {
    const env = setup({ manual: true });
    const switching = env.registry.changeLanguage("de");
    const page = env.registry.load(["help"]);
    env.gate("en:help").open();
    await page;

    env.gate("de:core").open();
    await settle();
    expect(env.i18n.language).toBe("en");

    env.gate("de:help").open();
    await expect(switching).resolves.toBe(true);

    expect(env.i18n.language).toBe("de");
    expect(env.i18n.t("help.title")).toBe("Hilfe");
  });

  it("lets the latest switch win when two overlap", async () => {
    const env = setup({ manual: true });
    const toGerman = env.registry.changeLanguage("de");
    const toFrench = env.registry.changeLanguage("fr");

    env.gate("fr:core").open();
    await expect(toFrench).resolves.toBe(true);
    expect(env.i18n.language).toBe("fr");

    env.gate("de:core").open();
    await expect(toGerman).resolves.toBe(false);
    expect(env.i18n.language).toBe("fr");
    expect(env.i18n.t("nav.home")).toBe("Accueil");
  });

  it("stays on the current language when a collection fails to load", async () => {
    const env = setup({ manual: true });
    const switching = env.registry.changeLanguage("de");
    env.gate("de:core").fail(new Error("offline"));

    await expect(switching).rejects.toThrow("offline");
    expect(env.i18n.language).toBe("en");
    expect(env.i18n.t("nav.home")).toBe("Home");
  });

  it("loads the new language's collections only once across repeated switches", async () => {
    const env = setup();
    await env.registry.load(["wallet"]);

    await env.registry.changeLanguage("de");
    await env.registry.changeLanguage("en");
    await env.registry.changeLanguage("de");

    expect(env.gate("de:core").calls).toBe(1);
    expect(env.gate("de:wallet").calls).toBe(1);
    expect(env.i18n.t("wallet.title")).toBe("Geldbörse");
  });

  it("loads a page's collection in the language in use", async () => {
    const env = setup();
    await env.registry.changeLanguage("fr");

    await env.registry.load(["help"]);

    expect(env.gates.has("en:help")).toBe(false);
    expect(env.i18n.t("help.title")).toBe("Aide");
  });

  it("recognises only the languages it was given", () => {
    const env = setup();

    expect(env.registry.isLanguage("de")).toBe(true);
    expect(env.registry.isLanguage("it")).toBe(false);
    expect(env.registry.isLanguage(undefined)).toBe(false);
  });
});

describe("loadersFromGlob", () => {
  it("maps <language>/<collection>.json paths to their loaders", async () => {
    const wallet = vi.fn(async () => ({
      default: { "wallet.title": "Wallet" },
    }));
    const loaderFor = loadersFromGlob<Collection, Language>({
      "./locales/en/wallet.json": wallet,
      "./locales/de/core.json": async () => ({ default: {} }),
    });

    expect(loaderFor("en", "wallet")).toBe(wallet);
    expect(loaderFor("de", "core")).toBeTypeOf("function");
    expect(loaderFor("fr", "core")).toBeUndefined();
  });
});
