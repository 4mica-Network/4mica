import { printable } from "../ui/output.js";

/**
 * What this process has already let go of: a transaction broadcast, a
 * payment handed to a seller. Once anything is out, a failure or Ctrl-C can
 * no longer be reported as "nothing happened, try again": the transaction
 * may land, the seller may redeem the payment, and a second run would send
 * it twice.
 *
 * The money commands call `beginSending` just before the call that signs.
 * The request wrapper in `net.ts` records what actually leaves, so the hash
 * is known, and printed, as soon as the chain has it.
 */

/** A payment header sent to a seller: the terms it was signed for. */
export interface SentPayment {
  url: string;
  network?: string;
  asset?: string;
  amountRaw?: string;
  payTo?: string;
}

const state = {
  /** What the command is sending, as "the deposit of 5 USDC". */
  sending: undefined as string | undefined,
  transactions: [] as string[],
  payments: [] as SentPayment[],
  explorer: undefined as string | undefined,
  /** Where to look afterwards: commands such as `4mica balance`. */
  check: [] as string[],
  /** A broadcast left, and the node's answer to it never arrived. */
  broadcastLost: false,
};

/** For tests: a fresh process. */
export function resetOutcome(): void {
  state.sending = undefined;
  state.transactions = [];
  state.payments = [];
  state.explorer = undefined;
  state.check = [];
  state.broadcastLost = false;
}

/**
 * A signed transaction was handed to the chain's node and no answer to it
 * came back: the connection dropped, or the wait ran out. The node may have
 * taken it. An answer, whether a hash or a refusal, is not this.
 *
 * shortcut: this, `broadcastLost` and their use in `toCliError` stand in
 * for the SDK, which reports a lost broadcast as a failed write. They go
 * once it raises an unknown-outcome error of its own for it.
 */
export function recordLostBroadcast(): void {
  state.broadcastLost = true;
}

/**
 * Whether a broadcast went unanswered and no later attempt got a hash. Once
 * a hash is known the transaction is tracked by it, and what happens next
 * (a revert, a receipt that does not come) is reported for what it is.
 */
export const broadcastLost = (): boolean =>
  state.broadcastLost && state.transactions.length === 0;

/** The network's block explorer, for linking a transaction hash. */
export function setExplorer(url: string | undefined): void {
  state.explorer = url;
}

/**
 * From here on, something may leave this process that cannot be called
 * back. `check` names the commands that show whether it went through.
 */
export function beginSending(what: string, check: string[]): void {
  state.sending = what;
  state.check = check;
}

/** What is being sent, once `beginSending` has been called. */
export const sending = (): string | undefined => state.sending;

export const sentTransactions = (): readonly string[] => state.transactions;
export const sentPayments = (): readonly SentPayment[] => state.payments;

/** Whether anything may have left: a send begun, or one seen on the wire. */
export const anythingSent = (): boolean =>
  state.sending !== undefined ||
  state.transactions.length > 0 ||
  state.payments.length > 0;

export function explorerLink(hash: string): string {
  return state.explorer ? `${state.explorer}/tx/${hash}` : hash;
}

/** Returns false when the hash was already known. */
export function recordTransaction(hash: string): boolean {
  const clean = printable(hash);
  if (state.transactions.includes(clean)) return false;
  state.transactions.push(clean);
  return true;
}

export function recordPayment(payment: SentPayment): void {
  state.payments.push(payment);
}

/**
 * One sentence on what may already be out, for an error or an interrupt.
 * Undefined when nothing has begun.
 */
export function inFlightSummary(): string | undefined {
  if (!anythingSent()) return undefined;
  const parts: string[] = [];
  const what = state.sending ?? "a payment";
  if (state.transactions.length > 0) {
    parts.push(
      `${what} was sent as ${state.transactions.map(explorerLink).join(", ")}`,
    );
  } else if (state.payments.length > 0) {
    parts.push(
      state.payments
        .map(
          (p) =>
            `a signed payment${p.amountRaw ? ` of ${p.amountRaw} base units` : ""}` +
            `${p.payTo ? ` to ${p.payTo}` : ""} was sent to ${new URL(p.url).origin}; the seller may redeem it`,
        )
        .join("; "),
    );
  } else {
    parts.push(`${what} may already have been sent`);
  }
  return parts.join("; ");
}

/** Where to look before trying again. */
export function checkSuggestions(): string[] {
  const check =
    state.check.length > 0
      ? state.check
      : ["4mica balance", "4mica withdrawals", "4mica cycles"];
  return [
    "do not run it again yet: a second attempt could send it twice",
    `see whether it went through with ${check.map((c) => `\`${c}\``).join(" or ")}` +
      (state.transactions.length > 0 && state.explorer
        ? ", or follow the explorer link"
        : ""),
  ];
}
