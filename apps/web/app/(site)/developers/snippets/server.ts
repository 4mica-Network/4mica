import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";
import express from "express";

const app = express();

// Add 4Mica middleware. The facilitator and scheme are set up for you.
app.use(
  paymentMiddlewareFromConfig({
    "GET /data": {
      accepts: {
        scheme: "4mica-credit",
        price: "$0.01",
        network: "eip155:84532",
        payTo: "0xYourAddress",
      },
      description: "Premium data",
    },
  }),
);

app.get("/data", (_req, res) => res.json({ data: "premium content" }));
app.listen(3000);
