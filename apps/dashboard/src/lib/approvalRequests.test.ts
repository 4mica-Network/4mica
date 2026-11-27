import { HttpError, setRequestHeadersProvider } from "@4mica/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { notifyInfo } = vi.hoisted(() => ({ notifyInfo: vi.fn() }));
vi.mock("@/lib/notify", () => ({
  notifyInfo,
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

const { httpClient } = await import("@api/client");
const { applyApprovedRequest } = await import("@api/finance");
const {
  APPROVAL_STORAGE_KEY,
  ApprovalRequiredError,
  sentForApproval,
  storedRequest,
} = await import("./approvalRequests");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const APPROVAL = {
  id: "apr_1",
  kind: "GOVERNANCE",
  action: "spending_policy.change",
  summary: "Create policy Research",
  requiredApprovals: 2,
};

describe("governed requests", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    notifyInfo.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setRequestHeadersProvider(() => ({
      "X-Org-Id": "org_1",
      "X-Project-Id": "proj_1",
      "X-Environment": "production",
    }));
  });

  afterEach(() => {
    setRequestHeadersProvider(null);
    vi.unstubAllGlobals();
  });

  it("turns a 202 approval_required answer into a pending request instead of a success", async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          status: "approval_required",
          message: "needs approval",
          approvalRequest: APPROVAL,
        },
        202,
      ),
    );

    const error = await httpClient
      .post("/me/spending-policies", { name: "Research" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApprovalRequiredError);
    expect(sentForApproval(error)).toBe(true);
    expect(notifyInfo).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sent for approval" }),
    );
    expect(storedRequest("apr_1")).toMatchObject({
      method: "POST",
      url: "/me/spending-policies",
      data: { name: "Research" },
      summary: "Create policy Research",
      headers: {
        "X-Org-Id": "org_1",
        "X-Project-Id": "proj_1",
        "X-Environment": "production",
      },
    });
  });

  it("leaves ordinary answers alone and remembers nothing", async () => {
    fetchMock.mockResolvedValue(json({ id: "pol_1" }, 201));

    await expect(
      httpClient.post("/me/spending-policies", { name: "Research" }),
    ).resolves.toEqual({ id: "pol_1" });
    expect(localStorage.getItem(APPROVAL_STORAGE_KEY)).toBeNull();
  });

  it("replays the stored request with X-Approval-Id and the original scope", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          status: "approval_required",
          message: "needs approval",
          approvalRequest: APPROVAL,
        },
        202,
      ),
    );
    await httpClient
      .post("/me/spending-policies", { name: "Research" })
      .catch(() => undefined);

    setRequestHeadersProvider(() => ({
      "X-Org-Id": "org_other",
      "X-Environment": "sandbox",
    }));
    fetchMock.mockResolvedValueOnce(json({ id: "pol_1" }, 201));

    const stored = storedRequest("apr_1");
    expect(stored).not.toBeNull();
    await expect(
      applyApprovedRequest("apr_1", stored as NonNullable<typeof stored>),
    ).resolves.toEqual({ id: "pol_1" });

    const [url, init] = fetchMock.mock.calls[1];
    const headers = init.headers as Headers;
    expect(url).toContain("/me/spending-policies");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Research" }));
    expect(headers.get("x-approval-id")).toBe("apr_1");
    expect(headers.get("x-org-id")).toBe("org_1");
    expect(headers.get("x-environment")).toBe("production");
    expect(storedRequest("apr_1")).toBeNull();
  });

  it("keeps the stored request when the replay is refused with 409 approval_invalid", async () => {
    localStorage.setItem(
      APPROVAL_STORAGE_KEY,
      JSON.stringify({
        apr_1: {
          method: "DELETE",
          url: "/me/wallets/w_1",
          headers: { "X-Org-Id": "org_1" },
          summary: "Remove wallet",
          createdAt: "2026-11-27T00:00:00.000Z",
        },
      }),
    );
    fetchMock.mockResolvedValue(
      json({ error: "approval_invalid", message: "nope" }, 409),
    );

    const stored = storedRequest("apr_1");
    const error = await applyApprovedRequest(
      "apr_1",
      stored as NonNullable<typeof stored>,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(409);
    expect(storedRequest("apr_1")).not.toBeNull();
  });
});
