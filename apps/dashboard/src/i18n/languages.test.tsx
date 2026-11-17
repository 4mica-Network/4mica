import { INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { afterEach, describe, expect, it } from "vitest";
import { useAppLanguage } from "@/hooks/useAppLanguage";
import { formatDate } from "@/utils/format";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import i18n, { applyLanguage, LANGUAGE_STORAGE_KEY } from "./index";

const CATALOGUES = { de, fr, es } as Record<string, Record<string, string>>;
const english = en as Record<string, string>;

const placeholders = (value: string) =>
  [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort();

afterEach(async () => {
  await act(() => applyLanguage("en"));
  localStorage.clear();
});

describe.each(Object.keys(CATALOGUES))("the %s catalogue", (language) => {
  const catalogue = CATALOGUES[language];

  it("has exactly the English keys in the same order", () => {
    expect(Object.keys(catalogue)).toEqual(Object.keys(english));
  });

  it("keeps every placeholder and leaves nothing blank", () => {
    const broken = Object.keys(english).filter(
      (key) =>
        !catalogue[key]?.trim() ||
        placeholders(catalogue[key]).join() !==
          placeholders(english[key]).join(),
    );

    expect(broken).toEqual([]);
  });

  it("resolves every plural for any count", async () => {
    await applyLanguage(language);
    const stems = Object.keys(english)
      .filter((key) => key.endsWith("_other"))
      .map((key) => key.replace(/_other$/, ""));

    for (const stem of stems) {
      for (const count of [0, 1, 2, 1_000_000]) {
        const values = Object.fromEntries(
          placeholders(english[`${stem}_other`]).map((name) => [name, "x"]),
        );
        const text = i18n.t(stem, { ...values, count });
        expect(text, `${stem} at ${count}`).not.toBe(stem);
        expect(text, `${stem} at ${count}`).not.toContain("{{");
      }
    }
  });
});

function Greeting() {
  useAppLanguage();
  const { t } = useTranslation();
  return <p>{t("nav.payments")}</p>;
}

const renderWithLanguage = (language: string) => {
  let state = { user: { ...INITIAL_STATE, user: { language } as User } };
  const store = createStore(() => state);
  const setLanguage = (next: string) => {
    state = { user: { ...INITIAL_STATE, user: { language: next } as User } };
    store.dispatch({ type: "test/language" });
  };
  render(
    <Provider store={store}>
      <Greeting />
    </Provider>,
  );
  return setLanguage;
};

describe("switching language", () => {
  it("applies the saved language to the whole app", async () => {
    renderWithLanguage("de");

    await waitFor(() =>
      expect(screen.getByText(de["nav.payments"])).toBeVisible(),
    );
    expect(document.documentElement.lang).toBe("de");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("de");
  });

  it("follows a change made in settings without a reload", async () => {
    const setLanguage = renderWithLanguage("fr");
    await screen.findByText(fr["nav.payments"]);

    act(() => setLanguage("es"));

    expect(await screen.findByText(es["nav.payments"])).toBeVisible();
    expect(document.documentElement.lang).toBe("es");
  });

  it("falls back to English for a language it does not ship", async () => {
    await act(() => applyLanguage("tlh"));

    expect(i18n.language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("ends on the last choice when switches overlap", async () => {
    await act(async () => {
      const first = applyLanguage("de");
      const second = applyLanguage("fr");
      await Promise.all([first, second]);
    });

    expect(i18n.language).toBe("fr");
  });

  it("formats dates in the chosen language", async () => {
    const iso = "2026-03-05T12:00:00Z";
    const english = formatDate(iso);

    await act(() => applyLanguage("de"));

    expect(english).toBe("Mar 5, 2026");
    expect(formatDate(iso)).toBe("05.03.2026");
  });
});
