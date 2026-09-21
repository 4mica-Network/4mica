import "dotenv/config";

import { X402Flow, X402PaymentRequired } from "@4mica/sdk";
import { createClient } from "@4mica/sdk-node";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(
      `\n[buyer-live] ${name} is not set.\n` +
        `  Copy .env.example to .env and fill it in, or run the dev stack:\n` +
        `    scripts/dev-stack.sh up\n`,
    );
    process.exit(1);
  }
  return value;
};

const resourceUrl = (): string => {
  const url = required("RESOURCE_URL");

  const profile = process.env.PROFILE;
  const slug = process.env.LISTING_SLUG;
  if (profile && slug) {
    const base = process.env.PLAYGROUND_URL ?? "http://localhost:3100";
    console.log(`[buyer-live] listing page: ${base}/${profile}/api/${slug}`);
  }

  return url;
};

const decodePaymentRequired = (
  header: string | null,
  body: unknown,
): X402PaymentRequired => {
  if (header) {
    return X402PaymentRequired.fromRaw(
      JSON.parse(Buffer.from(header, "base64").toString("utf8")),
    );
  }
  return X402PaymentRequired.fromRaw(body);
};

async function main() {
  required("4MICA_WALLET_PRIVATE_KEY");
  const url = resourceUrl();

  const client = await createClient();

  try {
    console.log(`[buyer-live] GET ${url}`);
    const unpaid = await fetch(url);
    console.log(`[buyer-live] -> ${unpaid.status}`);

    if (unpaid.status !== 402) {
      console.log(
        "[buyer-live] not paywalled; nothing to pay for:",
        await unpaid.text(),
      );
      return;
    }

    const challenge = decodePaymentRequired(
      unpaid.headers.get("payment-required"),
      await unpaid
        .clone()
        .json()
        .catch(() => null),
    );

    const accepted = challenge.accepts.find((entry) =>
      entry.scheme.includes("4mica"),
    );
    if (!accepted) {
      console.error(
        "[buyer-live] the seller does not accept 4mica:",
        challenge.accepts.map((entry) => entry.scheme),
      );
      process.exit(1);
    }

    console.log(
      `[buyer-live] price ${accepted.amount} of ${accepted.asset} on ${accepted.network}, paid to ${accepted.payTo}`,
    );

    const flow = X402Flow.fromClient(client);
    const signed = await flow.signPaymentV2(
      challenge,
      accepted,
      client.signerAddress,
    );

    const paid = await fetch(url, {
      headers: { "PAYMENT-SIGNATURE": signed.header },
    });
    console.log(`[buyer-live] GET ${url} (paid) -> ${paid.status}`);

    if (!paid.ok) {
      console.error("[buyer-live] payment rejected:", await paid.text());
      process.exit(1);
    }

    console.log("[buyer-live] body:", await paid.json());

    const receipt = paid.headers.get("X-PAYMENT-RESPONSE");
    if (receipt) {
      console.log(
        "[buyer-live] receipt:",
        JSON.parse(Buffer.from(receipt, "base64").toString("utf8")),
      );
    }

    const positions = await client.account.assets();
    console.log("[buyer-live] positions:", positions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (/collateral|insufficient|balance/i.test(message)) {
      console.error(
        `\n[buyer-live] This wallet has no collateral to back a guarantee.\n` +
          `  Deposit some first:\n` +
          `    await client.deposit.of(null, 1_000_000_000_000_000n).send()\n` +
          `  or use the facilitator's gasless route, POST /deposit.\n`,
      );
      process.exit(1);
    }

    if (/not payable|payTo|network/i.test(message)) {
      console.error(
        `\n[buyer-live] The seller has not finished wiring up payments.\n` +
          `  Its listing needs a receiving wallet and a network before the\n` +
          `  402 it returns can be signed against.\n`,
      );
      process.exit(1);
    }

    throw error;
  } finally {
    await client.aclose();
  }
}

main().catch((error) => {
  console.error("[buyer-live] failed:", error);
  process.exit(1);
});
