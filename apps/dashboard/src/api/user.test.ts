import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setAuthTokenProvider, setRequestHeadersProvider } = await import(
  "@4mica/http"
);
const { upsertBusiness } = await import("./user");
const { getPublicInvitationPreview } = await import("./organization");

describe("workspace-scoped requests", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ legalName: "Analytical Engines" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setAuthTokenProvider(() => "tok_1");
    setRequestHeadersProvider(() => ({ "X-Org-Id": "acme" }));
  });

  afterEach(() => {
    setAuthTokenProvider(null);
    setRequestHeadersProvider(null);
    vi.unstubAllGlobals();
  });

  it("writes the business to the workspace it names, not the active one", async () => {
    await upsertBusiness({ legalName: "Analytical Engines" }, "personal");

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("x-org-id")).toBe("personal");
  });

  it("falls back to the active workspace when none is named", async () => {
    await upsertBusiness({ legalName: "Analytical Engines" });

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("x-org-id")).toBe("acme");
  });

  it("previews an invitation without credentials", async () => {
    await getPublicInvitationPreview("4mica_inv_abc");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/invitations/4mica_inv_abc/preview");
    expect((init.headers as Headers).has("authorization")).toBe(false);
    expect((init.headers as Headers).has("x-org-id")).toBe(false);
  });
});
