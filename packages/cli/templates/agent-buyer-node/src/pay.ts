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

export async function payAndFetch<T>(url: string): Promise<PaidResult<T>> {
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
