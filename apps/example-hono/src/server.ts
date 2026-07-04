import type { PaywallVerifier } from "@4mica/sdk-hono";
import { paywall } from "@4mica/sdk-hono";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

/**
 * A mock verifier so the example runs without live 4Mica credentials. In a real
 * app, build a client and pass `client.rpc`:
 *
 *   import { createClient } from "@4mica/sdk-node";
 *   const client = await createClient();     // reads 4MICA_* env
 *   ...paywall(client.rpc, config)
 */
const verifier: PaywallVerifier = {
  async issueGuarantee(payload) {
    console.log("verifying payment payload:", payload);
    return { claims: "0xdemoClaims", signature: "0xdemoSignature" };
  },
};

const app = new Hono();

app.use(
  "/protected",
  paywall(verifier, {
    payTo: "0x1111111111111111111111111111111111111111",
    asset: "0x0000000000000000000000000000000000000000",
    network: "base-sepolia",
    amount: "1000",
    tabEndpoint: "http://localhost:3001/tab",
    description: "Premium data feed",
  }),
);

app.get("/protected", (c) => {
  const guarantee = c.get("paymentGuarantee");
  return c.json({ ok: true, guarantee, data: "🔓 premium content unlocked" });
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`example-hono listening on http://localhost:${port}`);
  console.log(
    `  → curl -i http://localhost:${port}/protected            # 402 + requirements`,
  );
  console.log(
    `  → curl -i -H "X-PAYMENT: $(printf '{"payload":{}}' | base64)" http://localhost:${port}/protected  # 200`,
  );
});
