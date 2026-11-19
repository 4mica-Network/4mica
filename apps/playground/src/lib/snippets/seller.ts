import { codeString, shellQuote } from "./shared";

export interface SellerSnippetInput {
  kind: "listing" | "agent";
  method: string;
  url: string | null;
}

export interface SellerSnippets {
  install: string;
  env: string;
  connect: string;
  record: string;
  protect: string;
  handle: string;
  test: string;
}

export const PLACEHOLDER_ROUTE = "/paid";
const PORT = 3000;
const LOCAL_ORIGIN = `http://localhost:${PORT}`;

const routePath = (url: string | null): string => {
  if (url === null) {
    return PLACEHOLDER_ROUTE;
  }
  try {
    return new URL(url).pathname || "/";
  } catch {
    return PLACEHOLDER_ROUTE;
  }
};

export const buildSellerSnippets = ({
  kind,
  method: rawMethod,
  url,
}: SellerSnippetInput): SellerSnippets => {
  const method = rawMethod.toUpperCase();
  const path = routePath(url);
  const route = codeString(`${method} ${path}`);
  const publicUrl = codeString(url ?? `${LOCAL_ORIGIN}${path}`);

  const install = "pnpm add @4mica/sdk @4mica/x402 express dotenv";

  const env = "FOURMICA_API_KEY=4mica_sk_...";

  const connect = `import "dotenv/config";

import { createAppClient } from "@4mica/sdk/app";

const api = createAppClient({ apiKey: process.env.FOURMICA_API_KEY! });
const { ${kind} } = await api.resource();

if (!${kind}) {
  throw new Error("This key is not tied to a ${kind}.");
}

const {
  payToAddress: payTo,
  assetAddress: asset,
  assetDecimals: decimals,
  network,
  priceAmount: price,
} = ${kind};

if (!payTo || !network || !price || decimals === null) {
  throw new Error("Finish payment setup for this ${kind} in the dashboard.");
}`;

  const record = `import { parseSettlement } from "@4mica/sdk/app";
import {
  FourMicaFacilitatorClient,
  x402ResourceServer,
} from "@4mica/x402/server";

const facilitator = new FourMicaFacilitatorClient();
const server = new x402ResourceServer(facilitator);

server.onAfterSettle(async (settlement) => {
  const { reqId, payerAddress, amount, guaranteeClaims, guaranteeSignature } =
    parseSettlement(settlement);

  try {
    await api.reportPayment({
      reqId,
      payerAddress,
      amount,
      guaranteeClaims,
      guaranteeSignature,
      recipientAddress: payTo,
      network,
      assetAddress: asset,
      resource: ${publicUrl},
    });
  } catch (error) {
    console.error("Payment report failed:", error);
  }
});`;

  const protect = `import { toBaseUnits, toCaip2, ZERO_ADDRESS } from "@4mica/sdk";
import { paymentMiddleware } from "@4mica/x402/server/express";
import express from "express";

const app = express();
app.use(express.json());

app.use(
  paymentMiddleware(
    {
      ${route}: {
        accepts: {
          scheme: "4mica-credit",
          price: {
            amount: toBaseUnits(price, decimals).toString(),
            asset: asset ?? ZERO_ADDRESS,
          },
          network: toCaip2(network),
          payTo,
        },
      },
    },
    server,
  ),
);`;

  const handle = `import { paymentFromHeader } from "@4mica/sdk/app";

app.${method.toLowerCase()}(${codeString(path)}, async (req, res) => {
  const paid = paymentFromHeader(
    req.get("payment-signature") ?? "",
    decimals,
  );
  const decision = await api.resolveCustomer({
    payerAddress: paid.payerAddress,
    network,
    amount: paid.amount,
  });
  if (!decision.allowed) {
    res.status(403).json({ error: decision.deniedReason });
    return;
  }

  res.json({ ok: true });
});

app.listen(${PORT});`;

  const test = `curl -i -X ${method} ${shellQuote(`${LOCAL_ORIGIN}${path}`)}

# HTTP/1.1 402 Payment Required
# The body carries the price, network and receiving wallet from the dashboard.`;

  return { install, env, connect, record, protect, handle, test };
};
