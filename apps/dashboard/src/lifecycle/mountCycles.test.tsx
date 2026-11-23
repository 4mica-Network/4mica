import { Modal, Switch, Tooltip } from "@4mica/ui";
import { act } from "@testing-library/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEphemeralSecret } from "@/hooks/useEphemeralSecret";
import { useMediaQuery } from "@/hooks/useMediaQuery";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

type Target = Window | Document;

const live = new Map<string, number>();
const originals = new Map<
  Target,
  { add: Target["addEventListener"]; remove: Target["removeEventListener"] }
>();

const track = (target: Target, label: string) => {
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  originals.set(target, {
    add: target.addEventListener,
    remove: target.removeEventListener,
  });
  target.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    const key = `${label}:${type}`;
    live.set(key, (live.get(key) ?? 0) + 1);
    add(type, listener, options);
  }) as Target["addEventListener"];
  target.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    const key = `${label}:${type}`;
    live.set(key, (live.get(key) ?? 0) - 1);
    remove(type, listener, options);
  }) as Target["removeEventListener"];
};

function SecretHolder() {
  const { secret, reveal } = useEphemeralSecret();
  if (!secret) {
    reveal({ kind: "apiKey", id: "key_1", plaintext: "4mica_sk_secret" });
  }
  useMediaQuery("(min-width: 1024px)");
  return null;
}

function Everything() {
  return (
    <>
      <Tooltip title="Copy" open>
        <button type="button">anchor</button>
      </Tooltip>
      <Modal isOpen onClose={() => {}} title="Dialog">
        <button type="button">inside</button>
      </Modal>
      <Switch initialState />
      <SecretHolder />
    </>
  );
}

describe("repeated mounting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    live.clear();
    track(window, "window");
    track(document, "document");
  });

  afterEach(() => {
    for (const [target, original] of originals) {
      target.addEventListener = original.add;
      target.removeEventListener = original.remove;
    }
    originals.clear();
    vi.useRealTimers();
  });

  it("does not accumulate listeners, timers or DOM nodes across mount cycles under StrictMode", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const cycles = (count: number) => {
      for (let cycle = 0; cycle < count; cycle++) {
        const root = createRoot(container);
        act(() => {
          root.render(
            <StrictMode>
              <Everything />
            </StrictMode>,
          );
        });
        act(() => {
          vi.advanceTimersByTime(10);
        });
        act(() => {
          root.unmount();
        });
      }
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      return {
        listeners: Object.fromEntries(live),
        timers: vi.getTimerCount(),
        nodes: document.body.querySelectorAll("*").length,
      };
    };

    const afterFirst = cycles(50);
    const afterSecond = cycles(50);

    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond.timers).toBe(0);
    expect(
      Math.max(0, ...Object.values(afterSecond.listeners)),
    ).toBeLessThanOrEqual(1);
  });
});
