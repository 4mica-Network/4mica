import { FourMicaEvmScheme } from "@4mica/x402/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

// 1. Create your account
const account = privateKeyToAccount("0xYourPrivateKey");
// 2. Register the 4Mica credit scheme
const scheme = await FourMicaEvmScheme.create(account);
// 3. Wrap your existing fetch. That's it.
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:84532", client: scheme }],
});

// Now every request is credit-based. No gas, no chain.
const response = await fetchWithPayment("https://api.example.com/data");
