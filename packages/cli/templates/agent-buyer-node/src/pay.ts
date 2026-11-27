type Requirement = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  extra?: Record<string, unknown>;
};

type Required402 = {
  x402Version: number;
  resource: Record<string, unknown>;
  accepts: Requirement[];
};

function demoPaymentHeader(required: Required402): string {
  const req = required.accepts[0];
  // Mint a random 32-byte req_id — uniqueness is all core asks of it.
  const reqIdBytes = new Uint8Array(32);
  crypto.getRandomValues(reqIdBytes);
  const reqId = `0x${Array.from(reqIdBytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")}`;
  const envelope = {
    x402Version: 2,
    accepted: req,
    resource: required.resource,
    payload: {
      payload: {
        version: "v1",
        user_address: "0x2222222222222222222222222222222222222222",
        recipient_address: req.payTo,
        // Demo only: a real payment carries core's active cycle id.
        cycle_id: `0x${"0".repeat(64)}`,
        req_id: reqId,
        amount: `0x${BigInt(req.amount).toString(16)}`,
        asset_address: req.asset,
        timestamp: Math.floor(Date.now() / 1000),
        salt: `0x${"0".repeat(64)}`,
      },
      signature: "0xdemoSignature",
    },
  };
  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

export type PaidResult<T> = {
  status: number;
  body: T | null;
  paid: number;
};

// Live once the wallet key is set: payments are then signed for real through
// @4mica/sdk. Without it the payment is a hand-built stand-in that only a
// demo seller accepts.
const LIVE = Boolean(process.env.FOURMICA_WALLET_PRIVATE_KEY);

type Session = Awaited<
  ReturnType<typeof import("@4mica/sdk").FourMica.connect>
>;
let session: Promise<Session> | undefined;

/** One connection for the whole run: connecting logs in to 4mica core. */
function connected(): Promise<Session> {
  session ??= import("@4mica/sdk").then(({ FourMica }) => FourMica.connect());
  return session;
}

/**
 * Call once at the end of a run. A connection that failed has nothing to
 * close, and its error was already thrown to whoever asked for it.
 */
export async function closePayments(): Promise<void> {
  const client = await session?.catch(() => undefined);
  await client?.close();
}

/**
 * `client.fetch` answers a 402 by signing a payment within the spend limit
 * (1 USDC a payment unless `spend` says otherwise) and repeating the request.
 */
async function payLive<T>(url: string): Promise<PaidResult<T>> {
  const client = await connected();
  const paid = await client.fetch(url);
  return {
    status: paid.status,
    body: paid.ok ? ((await paid.json()) as T) : null,
    paid: Number(client.paymentFor(paid)?.amountRaw ?? 0),
  };
}

export async function payAndFetch<T>(url: string): Promise<PaidResult<T>> {
  if (LIVE) return payLive<T>(url);
  const first = await fetch(url);
  if (first.status !== 402) {
    return { status: first.status, body: (await first.json()) as T, paid: 0 };
  }

  // x402 v2 carries the requirements in a base64 `PAYMENT-REQUIRED` header.
  const required = JSON.parse(
    Buffer.from(first.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString(
      "utf8",
    ),
  ) as Required402;
  const requirement = required.accepts[0];
  const header = demoPaymentHeader(required);
  const paid = await fetch(url, { headers: { "PAYMENT-SIGNATURE": header } });
  return {
    status: paid.status,
    body: paid.ok ? ((await paid.json()) as T) : null,
    paid: Number(requirement.amount),
  };
}
