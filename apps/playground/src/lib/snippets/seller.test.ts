import { describe, expect, it } from "vitest";
import { buildSellerSnippets, PLACEHOLDER_ROUTE } from "./seller";

describe("buildSellerSnippets", () => {
  it("reads its payment terms from the dashboard instead of hardcoding them", () => {
    const snippets = buildSellerSnippets({
      kind: "listing",
      method: "GET",
      url: "https://api.example.com/v1/credit/limits?x=1",
    });

    expect(snippets.env).toBe("FOURMICA_API_KEY=4mica_sk_...");
    expect(snippets.connect).toContain("process.env.FOURMICA_API_KEY");
    expect(snippets.connect).toContain(
      "const { listing } = await api.resource();",
    );
    expect(snippets.record).toContain("parseSettlement(settlement)");
    expect(snippets.record).not.toContain(" as ");
    expect(snippets.install).not.toContain("@x402/core");
    expect(snippets.connect).not.toContain("toCaip2");
    expect(snippets.protect).toContain("network: toCaip2(network),");
    expect(snippets.protect).toContain(
      'import { toBaseUnits, toCaip2, ZERO_ADDRESS } from "@4mica/sdk";',
    );
    expect(snippets.connect).toContain("assetDecimals: decimals,");
    expect(snippets.protect).toContain(
      "amount: toBaseUnits(price, decimals).toString(),",
    );
    expect(snippets.handle).toContain("decimals,\n  );");
    expect(snippets.handle).not.toMatch(/paymentFromHeader\([^)]*\d\)/);
    expect(snippets.protect).toContain('"GET /v1/credit/limits": {');
    expect(snippets.handle).toContain('app.get("/v1/credit/limits"');
    for (const code of [snippets.connect, snippets.protect]) {
      expect(code).not.toMatch(/0x(?!0{40})[0-9a-fA-F]{40}/);
    }
    expect(snippets.test).toContain(
      "curl -i -X GET 'http://localhost:3000/v1/credit/limits'",
    );
  });

  it("reads an agent's terms for an agent", () => {
    const snippets = buildSellerSnippets({
      kind: "agent",
      method: "POST",
      url: "https://agent.example.com/run",
    });

    expect(snippets.connect).toContain(
      "const { agent } = await api.resource();",
    );
    expect(snippets.handle).toContain('app.post("/run"');
  });

  it("falls back to a placeholder route", () => {
    const snippets = buildSellerSnippets({
      kind: "listing",
      method: "GET",
      url: null,
    });

    expect(snippets.protect).toContain(`"GET ${PLACEHOLDER_ROUTE}": {`);
  });

  it("keeps a hostile url inside a string literal", () => {
    const snippets = buildSellerSnippets({
      kind: "listing",
      method: "GET",
      url: 'https://x.io/a"b',
    });

    expect(snippets.protect).toContain('"GET /a%22b": {');
  });
});
