import { FourMicaEvmScheme } from "@4mica/x402/server";
import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";
import express from "express";

const app = express();

// Add 4Mica middleware. One line.
app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /data": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.01",
          network: "eip155:84532",
          payTo: "0xYourAddress",
        },
      },
    },
    { advertisedEndpoint: "https://api.example.com/tabs" },
    undefined,
    [
      {
        network: "eip155:84532",
        server: new FourMicaEvmScheme("https://api.example.com/tabs"),
      },
    ],
  ),
);

app.get("/data", (req, res) => res.json({ data: "premium content" }));
app.listen(3000);
