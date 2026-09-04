/** Reading the signer's own balances and positions. */

import type { ClientCtx } from "@/client/ctx";
import {
  Asset,
  type AssetPosition,
  type StablecoinPosition,
} from "@/client/model";
import type { AssetBalanceInfo } from "@/models";
import { parseU256 } from "@/utils";

export class AccountClient {
  constructor(private ctx: ClientCtx) {}

  /** The signer's position in every asset the contract knows them by. */
  async assets(): Promise<AssetPosition[]> {
    const gateway = await this.ctx.gateway();
    const raw = await gateway.getUserAssets();
    return raw.map((item) => ({
      asset: item.asset,
      collateral: parseU256(item.collateral),
      withdrawalRequestAmount: parseU256(item.withdrawalRequestAmount),
      withdrawalRequestTimestamp: Number(item.withdrawalRequestTimestamp),
    }));
  }

  /** Collateral deposited in `asset`, before any yield. */
  async principalBalance(asset?: Asset | string | null): Promise<bigint> {
    const gateway = await this.ctx.gateway();
    return gateway.principalBalance(
      this.ctx.signerAddress,
      Asset.coerce(asset).address,
    );
  }

  /** What the signer could withdraw from `asset` right now. */
  async withdrawableBalance(asset?: Asset | string | null): Promise<bigint> {
    const gateway = await this.ctx.gateway();
    return gateway.withdrawableBalance(
      this.ctx.signerAddress,
      Asset.coerce(asset).address,
    );
  }

  /**
   * The signer's full position in a yield-bearing stablecoin: principal,
   * yield and how it is split, plus the pool-level totals the split is
   * derived from.
   */
  async stablecoinPosition(token: string): Promise<StablecoinPosition> {
    const gateway = await this.ctx.gateway();
    const user = this.ctx.signerAddress;
    const tokenAddress = Asset.erc20(token).address;

    return {
      asset: tokenAddress,
      principal: await gateway.principalBalance(user, tokenAddress),
      guaranteeCapacity: await gateway.guaranteeCapacity(user, tokenAddress),
      grossYield: await gateway.grossYield(user, tokenAddress),
      protocolYieldShare: await gateway.protocolYieldShare(user, tokenAddress),
      userNetYield: await gateway.userNetYield(user, tokenAddress),
      withdrawableBalance: await gateway.withdrawableBalance(
        user,
        tokenAddress,
      ),
      totalUserScaledBalance:
        await gateway.totalUserScaledBalance(tokenAddress),
      protocolScaledBalance: await gateway.protocolScaledBalance(tokenAddress),
      surplusScaledBalance: await gateway.surplusScaledBalance(tokenAddress),
      contractScaledATokenBalance:
        await gateway.contractScaledATokenBalance(tokenAddress),
      stablecoinAToken: await gateway.stablecoinAToken(tokenAddress),
    };
  }

  /**
   * The signer's balance in `asset` as guarantees are accounted against it,
   * including how much is currently locked. `null` when the signer holds
   * nothing in that asset. Lags the chain: a fresh deposit appears once it
   * has been observed and confirmed.
   */
  async assetBalance(
    asset?: Asset | string | null,
  ): Promise<AssetBalanceInfo | null> {
    return this.ctx.rpc.getUserAssetBalance(
      this.ctx.signerAddress,
      Asset.coerce(asset).address,
    );
  }
}
