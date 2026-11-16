import {
  isNativeAsset,
  type ResolvedToken,
  resolveToken,
  type TokenLike,
} from "@/amounts";
import type { Client } from "@/client";
import { TokenNotSupportedError } from "@/errors";
import type { AssetRef } from "@/facade/models";
import type { NetworkInfo } from "@/networks";

/** One network of a `FourMica` session. `info` is undefined for a self-hosted core. */
export class NetworkSession {
  private tokenList?: Promise<TokenLike[]>;

  constructor(
    readonly name: string,
    readonly caip2: string,
    readonly info: NetworkInfo | undefined,
    readonly client: Client,
  ) {}

  get nativeSymbol(): string {
    return this.info?.nativeSymbol ?? "ETH";
  }

  tokens(): Promise<TokenLike[]> {
    this.tokenList ??= this.client.tokens.supported().then(
      (response) => response.tokens,
      (err) => {
        this.tokenList = undefined;
        throw err;
      },
    );
    return this.tokenList;
  }

  async token(input: string): Promise<ResolvedToken> {
    const tokens = isNativeAsset(input, this.nativeSymbol)
      ? []
      : await this.tokens();
    return resolveToken(tokens, input, {
      nativeSymbol: this.nativeSymbol,
      network: this.caip2,
    });
  }

  /** Like `token`, but `undefined` for an asset core does not list. */
  async tryToken(input: string): Promise<ResolvedToken | undefined> {
    try {
      return await this.token(input);
    } catch (err) {
      if (err instanceof TokenNotSupportedError) return undefined;
      throw err;
    }
  }

  explorerTx(txHash: string): string | undefined {
    return this.info && `${this.info.explorerUrl}/tx/${txHash}`;
  }
}

export const assetRef = ({
  symbol,
  address,
  decimals,
}: AssetRef): AssetRef => ({
  symbol,
  address,
  decimals,
});
