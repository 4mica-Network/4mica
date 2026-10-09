import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDraft } from "./useDraft";

describe("useDraft", () => {
  it("tracks edits as changes", () => {
    const initial = { name: "Acme", city: "" };
    const { result } = renderHook(() => useDraft(initial));

    act(() => result.current.set("city", "Paris"));

    expect(result.current.isDirty).toBe(true);
    expect(result.current.changes).toEqual({ city: "Paris" });
  });

  it("keeps unsaved edits when another field is saved", () => {
    const { result, rerender } = renderHook(
      ({ initial }) => useDraft(initial),
      { initialProps: { initial: { name: "Acme", city: "" } } },
    );

    act(() => result.current.set("name", "Acme Ltd"));
    act(() => result.current.set("city", "Paris"));

    rerender({ initial: { name: "Acme", city: "Paris" } });

    expect(result.current.draft).toEqual({ name: "Acme Ltd", city: "Paris" });
    expect(result.current.changes).toEqual({ name: "Acme Ltd" });
  });

  it("keeps the typed value when the server rolls back a rejected save", () => {
    const { result, rerender } = renderHook(
      ({ initial }) => useDraft(initial),
      { initialProps: { initial: { email: "old@acme.io" } } },
    );

    act(() => result.current.set("email", "new@acme"));
    rerender({ initial: { email: "new@acme" } });
    rerender({ initial: { email: "old@acme.io" } });

    expect(result.current.draft.email).toBe("new@acme");
  });

  it("keeps a rejected edit made after an earlier accepted save", () => {
    const { result, rerender } = renderHook(
      ({ initial }) => useDraft(initial),
      { initialProps: { initial: { name: "A" } } },
    );

    act(() => result.current.set("name", "B"));
    rerender({ initial: { name: "B" } });

    act(() => result.current.set("name", "C"));
    rerender({ initial: { name: "C" } });
    rerender({ initial: { name: "B" } });

    expect(result.current.draft.name).toBe("C");
    expect(result.current.changes).toEqual({ name: "C" });
  });

  it("adopts the value the server settles on after a save", () => {
    const { result, rerender } = renderHook(
      ({ initial }) => useDraft(initial),
      { initialProps: { initial: { website: "" } } },
    );

    act(() => result.current.set("website", "https://acme.io"));
    rerender({ initial: { website: "https://acme.io" } });
    rerender({ initial: { website: "https://acme.io/" } });

    expect(result.current.draft.website).toBe("https://acme.io/");
    expect(result.current.isDirty).toBe(false);
  });

  it("adopts server values for untouched fields", () => {
    const { result, rerender } = renderHook(
      ({ initial }) => useDraft(initial),
      { initialProps: { initial: { name: "Acme" } } },
    );

    rerender({ initial: { name: "Acme Inc" } });

    expect(result.current.draft.name).toBe("Acme Inc");
    expect(result.current.isDirty).toBe(false);
  });

  it("discards edits on reset", () => {
    const initial = { name: "Acme" };
    const { result } = renderHook(() => useDraft(initial));

    act(() => result.current.set("name", "Other"));
    act(() => result.current.reset());

    expect(result.current.draft.name).toBe("Acme");
  });
});
