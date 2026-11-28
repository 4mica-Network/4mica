import { createHmac, timingSafeEqual } from "node:crypto";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import securityActionTypes from "@stores/security/actionTypes";
import { INITIAL_STATE as SECURITY_INITIAL_STATE } from "@stores/security/reducer";
import type { RevealSecuritySecret } from "@stores/security/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { backfillBounds, parsePrefixes, verificationSnippet } from "./snippet";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

const { AuditStreamsSettings } = await import("./index");

const STREAM = {
  id: "str_1",
  name: "SIEM",
  url: "https://siem.example.com/in",
  status: "FAILING" as const,
  actionPrefixes: ["member."],
  secretPrefix: "abc",
  lastDeliveryAt: "2026-11-26T10:00:00.000Z",
  lastStatusCode: 502,
  lastError: "Bad gateway",
  consecutiveFailures: 3,
  nextAttemptAt: "2026-11-27T10:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
};

type Action = {
  type: string;
  payload?: unknown;
  onReveal?: RevealSecuritySecret;
};
let dispatched: Action[] = [];

const renderStreams = (permissions: Permission[]) => {
  dispatched = [];
  const organization: OrganizationSummary = {
    id: "acme",
    handle: "acme",
    name: "Acme",
    avatarUrl: null,
    personal: false,
    role: "OWNER",
    permissions,
    memberCount: 3,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "me", name: "Ada" } as User },
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [organization],
      activeId: organization.id,
      status: "loaded" as const,
    },
    security: {
      ...SECURITY_INITIAL_STATE,
      streams: { items: [STREAM], status: "loaded" as const, error: null },
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as Action);
    return current;
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <AuditStreamsSettings />
      </MemoryRouter>
    </Provider>,
  );
};

describe("audit streaming", () => {
  it("shows delivery health for each stream", () => {
    renderStreams(["audit.read", "security.manage"]);

    expect(screen.getByTestId("stream-status-str_1-tag")).toHaveTextContent(
      "Failing",
    );
    expect(screen.getByTestId("stream-health-str_1")).toHaveTextContent("502");
    expect(screen.getByTestId("stream-error-str_1")).toHaveTextContent(
      "Bad gateway",
    );
  });

  it("creates a stream and shows its secret with a verification snippet only once", () => {
    renderStreams(["audit.read", "security.manage"]);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Splunk" },
    });
    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "https://splunk.example.com/hook" },
    });
    fireEvent.change(screen.getByLabelText("Action filters"), {
      target: { value: "member., security." },
    });
    fireEvent.click(screen.getByTestId("stream-create-submit"));

    const request = dispatched.find(
      (action) => action.type === securityActionTypes.SECURITY_OP_REQUESTED,
    );
    expect(request?.payload).toEqual({
      op: "createStream",
      data: {
        name: "Splunk",
        url: "https://splunk.example.com/hook",
        actionPrefixes: ["member.", "security."],
      },
    });

    act(() =>
      request?.onReveal?.({
        kind: "streamSecret",
        secret: "whsec_once",
        streamId: "str_2",
        name: "Splunk",
      }),
    );
    const card = screen.getByTestId("stream-secret");
    expect(card).toHaveTextContent("whsec_once");
    expect(card).toHaveTextContent("X-4mica-Signature");

    fireEvent.click(screen.getByText("I've saved it"));
    expect(screen.queryByText("whsec_once")).toBeNull();
  });

  it("refuses a plain http endpoint", () => {
    renderStreams(["audit.read", "security.manage"]);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Plain" },
    });
    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: "http://plain.example.com" },
    });
    expect(screen.getByText("Use an https:// URL.")).toBeInTheDocument();
    expect(screen.getByTestId("stream-create-submit")).toBeDisabled();
  });

  it("lets auditors read streams without changing them", () => {
    renderStreams(["audit.read"]);

    expect(screen.getByTestId("streams-read-only")).toBeInTheDocument();
    expect(screen.queryByTestId("stream-create")).toBeNull();
    expect(screen.queryByTestId("stream-actions-str_1")).toBeNull();
  });
});

describe("stream helpers", () => {
  it("ships a snippet that verifies a real signature", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ events: [] });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret)
      .update(`${t}.${body}`)
      .digest("hex");
    const source = verificationSnippet()
      .replace(/^import .*$/m, "")
      .replace(/export function/, "function")
      .split("\nverify4micaSignature(")[0];
    const verify = new Function(
      "createHmac",
      "timingSafeEqual",
      "Buffer",
      `${source}\nreturn verify4micaSignature;`,
    )(createHmac, timingSafeEqual, Buffer) as (
      raw: string,
      header: string,
      key: string,
    ) => boolean;

    expect(verify(body, `t=${t},v1=${v1}`, secret)).toBe(true);
    expect(verify(body, `t=${t},v1=${v1}`, "other")).toBe(false);
    expect(verify(`${body} `, `t=${t},v1=${v1}`, secret)).toBe(false);
  });

  it("limits backfill to the last 90 days and splits filters", () => {
    const bounds = backfillBounds(new Date("2026-11-27T12:00:00.000Z"));
    expect(bounds).toEqual({ min: "2026-08-29", max: "2026-11-27" });
    expect(parsePrefixes("member., security.\npayment.")).toEqual([
      "member.",
      "security.",
      "payment.",
    ]);
  });
});
