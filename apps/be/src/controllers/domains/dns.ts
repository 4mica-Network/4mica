import { resolveTxt } from "node:dns/promises";

export interface TxtResolver {
  resolveTxt: (name: string) => Promise<string[][]>;
}

export const txtResolver: TxtResolver = { resolveTxt };

const MISSING = new Set(["ENOTFOUND", "ENODATA", "ENOTIMP", "NXDOMAIN"]);

export type TxtLookup =
  | { ok: true; values: string[] }
  | { ok: false; reason: string };

export const lookupTxt = async (name: string): Promise<TxtLookup> => {
  try {
    const records = await txtResolver.resolveTxt(name);
    return { ok: true, values: records.map((chunks) => chunks.join("")) };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    return MISSING.has(code)
      ? { ok: true, values: [] }
      : { ok: false, reason: code || "lookup_failed" };
  }
};
