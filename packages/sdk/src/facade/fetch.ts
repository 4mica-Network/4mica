import { formatUnits, parseAmount, toBaseUnits } from "@/amounts";
import { SpendLimitError } from "@/errors";
import type { AssetRef, PaymentRecord, SpendLimits } from "@/facade/models";
import type { PaymentProtocol, PaymentTerms } from "@/facade/protocols/types";
import { assetRef, type NetworkSession } from "@/facade/session";

const asList = (value: string | readonly string[] | undefined) =>
  value === undefined ? [] : typeof value === "string" ? [value] : value;

interface Reservation {
  key: string;
  amount: bigint;
  asset: AssetRef;
}

/** Reserves before signing, so concurrent payments cannot overshoot `total`. */
export class SpendLimiter {
  private readonly spent = new Map<string, bigint>();
  private readonly perPayment: readonly string[];
  private readonly total: readonly string[];
  private readonly payTo?: ReadonlySet<string>;

  constructor(limits: SpendLimits = {}) {
    this.perPayment = asList(limits.perPayment ?? "1 USDC");
    this.total = asList(limits.total);
    this.payTo =
      limits.payTo && new Set(limits.payTo.map((a) => a.toLowerCase()));
    for (const spec of [...this.perPayment, ...this.total]) parseAmount(spec);
  }

  async reserve(
    session: NetworkSession,
    terms: PaymentTerms,
    url: string,
  ): Promise<Reservation | SpendLimitError> {
    if (this.payTo && !this.payTo.has(terms.payTo.toLowerCase())) {
      return new SpendLimitError(
        "payTo",
        url,
        `${terms.payTo} is not in the allowed payees`,
      );
    }
    const token = await session.tryToken(terms.asset);
    if (!token) {
      return new SpendLimitError(
        "assets",
        url,
        `${terms.asset} is not an asset 4Mica accepts on ${session.caip2}`,
      );
    }
    const asset = assetRef(token);
    const show = (amount: bigint) =>
      `${formatUnits(amount, asset.decimals)} ${asset.symbol}`;

    const perPayment = await this.limitFor(session, this.perPayment, asset);
    if (perPayment === undefined) {
      return new SpendLimitError(
        "assets",
        url,
        `the seller asks for ${asset.symbol}, which no perPayment limit names`,
      );
    }
    if (terms.amount > perPayment) {
      return new SpendLimitError(
        "perPayment",
        url,
        `the seller asks ${show(terms.amount)}, over the ${show(perPayment)} ` +
          "per-payment limit",
      );
    }

    const total = await this.limitFor(session, this.total, asset);
    // No await from here to the set, or concurrent payments could overshoot.
    const key = `${session.caip2}:${asset.address.toLowerCase()}`;
    const spent = this.spent.get(key) ?? 0n;
    if (total !== undefined && spent + terms.amount > total) {
      return new SpendLimitError(
        "total",
        url,
        `${show(spent)} spent so far; ${show(terms.amount)} more would pass ` +
          `the ${show(total)} session limit`,
      );
    }
    this.spent.set(key, spent + terms.amount);
    return { key, amount: terms.amount, asset };
  }

  release(reservation: Reservation): void {
    const spent = this.spent.get(reservation.key) ?? 0n;
    this.spent.set(reservation.key, spent - reservation.amount);
  }

  private async limitFor(
    session: NetworkSession,
    specs: readonly string[],
    asset: AssetRef,
  ): Promise<bigint | undefined> {
    for (const spec of specs) {
      const { amount, asset: name } = parseAmount(spec);
      const token = await session.tryToken(name);
      if (token?.address.toLowerCase() === asset.address.toLowerCase()) {
        return toBaseUnits(amount, token.decimals);
      }
    }
    return undefined;
  }
}

export interface FetchContext {
  fetchFn: typeof fetch;
  protocols: readonly PaymentProtocol[];
  /** `undefined` where this session does not pay. */
  sessionFor(caip2: string): NetworkSession | undefined;
  limiter: SpendLimiter;
  record(response: Response, payment: PaymentRecord): void;
}

export async function payingFetch(
  ctx: FetchContext,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const response = await ctx.fetchFn(request.clone());
  if (response.status !== 402) {
    return response;
  }

  const options: {
    protocol: PaymentProtocol;
    terms: PaymentTerms;
    session: NetworkSession;
  }[] = [];
  for (const protocol of ctx.protocols) {
    for (const terms of await protocol.terms(response.clone())) {
      const session = ctx.sessionFor(terms.network);
      if (session) options.push({ protocol, terms, session });
    }
  }
  if (options.length === 0) {
    return response;
  }

  let refusal: SpendLimitError | undefined;
  for (const { protocol, terms, session } of options) {
    const reservation = await ctx.limiter.reserve(session, terms, request.url);
    if (reservation instanceof SpendLimitError) {
      refusal ??= reservation;
      continue;
    }

    let paid: Response;
    try {
      const headers = new Headers(request.headers);
      for (const [name, value] of Object.entries(
        await protocol.pay(terms, session.client),
      )) {
        headers.set(name, value);
      }
      // Retried once; a second 402 goes back to the caller.
      paid = await ctx.fetchFn(new Request(request, { headers }));
    } catch (err) {
      ctx.limiter.release(reservation);
      throw err;
    }
    if (paid.status === 402) {
      ctx.limiter.release(reservation);
      return paid;
    }
    ctx.record(paid, {
      protocol: protocol.name,
      network: terms.network,
      asset: reservation.asset,
      amount: formatUnits(terms.amount, reservation.asset.decimals),
      amountRaw: terms.amount,
      payTo: terms.payTo,
    });
    return paid;
  }
  throw refusal as SpendLimitError;
}
