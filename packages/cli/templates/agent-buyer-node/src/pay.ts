type Requirement = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  extra?: { tabEndpoint?: string };
};

type Required402 = { x402Version: number; accepts: Requirement[] };

function demoPaymentHeader(req: Requirement): string {
  const envelope = {
    x402Version: 1,
    scheme: req.scheme,
    network: req.network,
    payload: {
      claims: {
        version: "v1",
        user_address: "0x2222222222222222222222222222222222222222",
        recipient_address: req.payTo,
        req_id: "0x1",
        amount: `0x${BigInt(req.amount).toString(16)}`,
        asset_address: req.asset,
        timestamp: Math.floor(Date.now() / 1000),
      },
      signature: "0xdemoSignature",
      scheme: "eip712",
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

  const requirement = ((await first.json()) as Required402).accepts[0];
  const header = demoPaymentHeader(requirement);
  const paid = await fetch(url, { headers: { "X-PAYMENT": header } });
  return {
    status: paid.status,
    body: paid.ok ? ((await paid.json()) as T) : null,
    paid: Number(requirement.amount),
  };
}
