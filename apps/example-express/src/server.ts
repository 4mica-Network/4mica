import type { PaywallVerifier } from "@4mica/sdk-express";
import { paywall } from "@4mica/sdk-express";
import express from "express";

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

const app = express();

app.get(
  "/protected",
  paywall(verifier, {
    payTo: "0x1111111111111111111111111111111111111111",
    asset: "0x0000000000000000000000000000000000000000",
    network: "base-sepolia",
    amount: "1000",
    tabEndpoint: "http://localhost:3000/tab",
    description: "Premium data feed",
  }),
  (_req, res) => {
    res.json({ ok: true, data: "🔓 premium content unlocked" });
  },
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`example-express listening on http://localhost:${port}`);
  console.log(
    `  → curl -i http://localhost:${port}/protected            # 402 + requirements`,
  );
  console.log(
    `  → curl -i -H "X-PAYMENT: $(printf '{"payload":{}}' | base64)" http://localhost:${port}/protected  # 200`,
  );
});
