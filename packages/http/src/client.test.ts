import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpClient, HttpError, HttpMethod } from "./client";
import { setAuthTokenProvider } from "./token";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("HttpClient", () => {
  const client = new HttpClient("http://api.test/");
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    setAuthTokenProvider(null);
    vi.unstubAllGlobals();
  });

  it("joins the base URL with a leading-slash path", async () => {
    await client.get("/me");
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/me");
  });

  it("appends query params and skips undefined ones", async () => {
    await client.request({
      url: "/users",
      method: HttpMethod.GET,
      params: { page: 2, q: "ada", missing: undefined },
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("q")).toBe("ada");
    expect(url.searchParams.has("missing")).toBe(false);
  });

  it("attaches a bearer token from the registered provider", async () => {
    setAuthTokenProvider(() => "tok_123");
    await client.get("/me");
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer tok_123");
  });

  it("awaits an async token provider", async () => {
    setAuthTokenProvider(async () => "tok_async");
    await client.get("/me");
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer tok_async");
  });

  it("omits Authorization when skipAuth is set", async () => {
    setAuthTokenProvider(() => "tok_123");
    await client.request({
      url: "/public",
      method: HttpMethod.GET,
      skipAuth: true,
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.has("authorization")).toBe(false);
  });

  it("does not fail the request when the token provider throws", async () => {
    setAuthTokenProvider(() => {
      throw new Error("clerk unavailable");
    });
    await expect(client.get("/me")).resolves.toEqual({ ok: true });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.has("authorization")).toBe(false);
  });

  it("serialises JSON bodies and sets the content type", async () => {
    await client.patch("/me", { name: "Ada" });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(JSON.stringify({ name: "Ada" }));
    expect((init.headers as Headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("leaves FormData bodies alone without forcing a content type", async () => {
    const form = new FormData();
    form.append("file", "x");
    await client.post("/upload", form);
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(form);
    expect((init.headers as Headers).has("content-type")).toBe(false);
  });

  it("throws HttpError carrying the status and parsed body", async () => {
    fetchMock.mockResolvedValue(json({ error: "unauthorized" }, 401));
    const error = await client.get("/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(401);
    expect((error as HttpError).body).toEqual({ error: "unauthorized" });
  });

  it("returns undefined for 204 instead of throwing on an empty body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client.delete("/me")).resolves.toBeUndefined();
  });
});
