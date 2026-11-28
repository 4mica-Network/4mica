import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveBlob } = vi.hoisted(() => ({ saveBlob: vi.fn() }));
vi.mock("@/lib/download", () => ({ saveBlob }));

const { setAuthTokenProvider } = await import("@4mica/http");
const { exportAuditLog, exportPayments } = await import("./exports");

describe("CSV exports", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveBlob.mockReset();
    fetchMock = vi.fn().mockResolvedValue(
      new Response("id,amount\n1,10\n", {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setAuthTokenProvider(() => "tok_1");
  });

  afterEach(() => {
    setAuthTokenProvider(null);
    vi.unstubAllGlobals();
  });

  it("fetches with the bearer token and saves the body as a CSV file", async () => {
    await exportPayments({
      from: "2026-11-01T00:00:00.000Z",
      direction: "sent",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/me/finance/export/payments.csv");
    expect(url).toContain("direction=sent");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer tok_1");
    expect((init.headers as Headers).get("accept")).toBe("text/csv");

    const [blob, filename] = saveBlob.mock.calls[0];
    expect(filename).toMatch(/^payments-\d{4}-\d{2}-\d{2}\.csv$/);
    expect((blob as Blob).type).toContain("text/csv");
    expect(await (blob as Blob).text()).toBe("id,amount\n1,10\n");
  });

  it("passes the audit filters through", async () => {
    await exportAuditLog({ actionPrefix: "wallet." });
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/me/organization/audit-logs/export.csv?actionPrefix=wallet.",
    );
  });

  it("saves nothing when the server refuses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(exportPayments({})).rejects.toThrow();
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
