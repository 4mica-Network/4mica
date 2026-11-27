import { HttpError, HttpMethod } from "@4mica/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { notifyError } = vi.hoisted(() => ({ notifyError: vi.fn() }));
vi.mock("@/lib/notify", () => ({
  notifyError,
  notifyInfo: vi.fn(),
  notifySuccess: vi.fn(),
}));

const { handleAccessError, signInPath } = await import("./accessHandling");
const {
  ACCESS_ERROR_DEDUPE_MS,
  accessErrorOf,
  reportAccessError,
  setAccessErrorHandler,
} = await import("@/lib/accessErrors");
const { httpClient } = await import("@api/client");
const { toMessage } = await import("@utils/http-errors");

const deps = (
  overrides: Partial<Parameters<typeof handleAccessError>[1]> = {},
) => ({
  signOutTo: vi.fn(),
  openUserProfile: vi.fn(),
  personalOrganizationId: () => "personal",
  activeOrganizationIsPersonal: () => false,
  switchOrganization: vi.fn(),
  ...overrides,
});

const access = (code: string, extra: Record<string, unknown> = {}) =>
  accessErrorOf(
    new HttpError(code === "session_too_old" ? 401 : 403, "Denied", {
      error: code,
      message: "Server says no",
      ...extra,
    }),
  );

describe("access error handling", () => {
  beforeEach(() => {
    notifyError.mockReset();
    window.history.replaceState(null, "", "/payments?page=2");
  });

  it("only treats the documented 401/403 codes as access errors", () => {
    expect(access("mfa_required")?.code).toBe("mfa_required");
    expect(
      accessErrorOf(new HttpError(500, "x", { error: "mfa_required" })),
    ).toBeNull();
    expect(
      accessErrorOf(new HttpError(403, "x", { error: "forbidden" })),
    ).toBeNull();
  });

  it("signs out to the sign-in page with the domain hint when SSO is required", () => {
    const d = deps();
    handleAccessError(
      access("sso_required", { domain: "acme.com" }) as NonNullable<
        ReturnType<typeof access>
      >,
      d,
    );
    expect(d.signOutTo).toHaveBeenCalledWith(
      `/sign-in?reason=sso_required&domain=acme.com&redirect_url=${encodeURIComponent("/payments?page=2")}`,
    );
  });

  it("signs out with an explanation when the session is too old", () => {
    const d = deps();
    handleAccessError(
      access("session_too_old") as NonNullable<ReturnType<typeof access>>,
      d,
    );
    expect(d.signOutTo).toHaveBeenCalledWith(
      signInPath({ reason: "session_too_old" }),
    );
  });

  it("explains MFA and offers the account security page", () => {
    const d = deps();
    handleAccessError(
      access("mfa_required") as NonNullable<ReturnType<typeof access>>,
      d,
    );
    const notice = notifyError.mock.calls[0][0];
    expect(notice.title).toBe("Two-step verification required");
    notice.action.onClick();
    expect(d.openUserProfile).toHaveBeenCalled();
    expect(d.signOutTo).not.toHaveBeenCalled();
  });

  it("explains a blocked network without signing out", () => {
    const d = deps();
    handleAccessError(
      access("ip_not_allowed") as NonNullable<ReturnType<typeof access>>,
      d,
    );
    expect(notifyError.mock.calls[0][0].title).toBe("Network not allowed");
    expect(d.signOutTo).not.toHaveBeenCalled();
  });

  it("moves a suspended member to their personal workspace", () => {
    const d = deps();
    handleAccessError(
      access("member_suspended") as NonNullable<ReturnType<typeof access>>,
      d,
    );
    expect(d.switchOrganization).toHaveBeenCalledWith("personal");
    expect(notifyError.mock.calls[0][0].content).toContain(
      "personal workspace",
    );
  });

  it("stays put when the suspended member is already in their personal workspace", () => {
    const d = deps({ activeOrganizationIsPersonal: () => true });
    handleAccessError(
      access("member_suspended") as NonNullable<ReturnType<typeof access>>,
      d,
    );
    expect(d.switchOrganization).not.toHaveBeenCalled();
  });

  it("gives the toast for a failed action the same explanation", () => {
    expect(
      toMessage(
        new HttpError(403, "x", { error: "sso_required", domain: "acme.com" }),
        "fallback",
      ),
    ).toContain("@acme.com");
  });
});

describe("reporting from the API client", () => {
  const handler = vi.fn();

  beforeEach(() => {
    handler.mockReset();
    setAccessErrorHandler(handler);
  });

  afterEach(() => {
    setAccessErrorHandler(null);
    vi.unstubAllGlobals();
  });

  it("reports an access error once even when many requests fail together", () => {
    const error = access("ip_not_allowed");
    expect(reportAccessError(error, 1_000)).toBe(true);
    expect(reportAccessError(error, 1_500)).toBe(false);
    expect(reportAccessError(error, 1_000 + ACCESS_ERROR_DEDUPE_MS)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("hands access errors from any request to the handler and still rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "member_suspended", message: "Suspended" }),
            { status: 403, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    await expect(
      httpClient.request({ url: "/me/payments", method: HttpMethod.GET }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(handler).toHaveBeenCalledWith({
      code: "member_suspended",
      message: "Suspended",
      domain: null,
    });
  });
});
