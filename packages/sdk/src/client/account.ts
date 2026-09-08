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

  async principalBalance(asset?: Asset | string | null): Promise<bigint> {
    const gateway = await this.ctx.gateway();
    return gateway.principalBalance(
      this.ctx.signerAddress,
      Asset.coerce(asset).address,
    );
  }

  async withdrawableBalance(asset?: Asset | string | null): Promise<bigint> {
    const gateway = await this.ctx.gateway();
    return gateway.withdrawableBalance(
      this.ctx.signerAddress,
      Asset.coerce(asset).address,
    );
  }

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

  async assetBalance(
    asset?: Asset | string | null,
  ): Promise<AssetBalanceInfo | null> {
    return this.ctx.rpc.getUserAssetBalance(
      this.ctx.signerAddress,
      Asset.coerce(asset).address,
    );
  }
}
