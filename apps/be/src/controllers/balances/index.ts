import { networkForChainId, PAYMENT_NETWORKS } from "@4mica/rules";
import { coreUnavailable, requireUserId } from "@controllers/shared";
import { appLogger } from "@logger/index";
import { getCoreClient } from "@services/core";
import type { RouteHandler } from "fastify";
import { zeroAddress } from "viem";
import { activeWalletsOn } from "./repository";

export const listBalancesHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  try {
    const core = await getCoreClient();
    if (!core) {
      return coreUnavailable(reply);
    }

    const network = networkForChainId(core.publicParams.chainId);
    if (!network) {
      return reply.send({ network: null, wallets: [] });
    }

    const [wallets, { tokens }] = await Promise.all([
      activeWalletsOn(userId, network),
      core.rpc.getSupportedTokens(),
    ]);

    const { currency } = PAYMENT_NETWORKS[network];
    const assets = [
      {
        address: zeroAddress,
        symbol: currency.symbol,
        decimals: currency.decimals,
      },
      ...tokens.map((token) => ({
        address: token.address.toLowerCase(),
        symbol: token.symbol,
        decimals: token.decimals ?? 18,
      })),
    ];

    const rows = await Promise.all(
      wallets.map(async (wallet) => ({
        ...wallet,
        assets: await Promise.all(
          assets.map(async (asset) => {
            const balance = await core.rpc.getUserAssetBalance(
              wallet.address,
              asset.address,
            );
            const total = balance?.total ?? 0n;
            const locked = balance?.locked ?? 0n;

            return {
              assetAddress: asset.address,
              symbol: asset.symbol,
              decimals: asset.decimals,
              total: total.toString(),
              locked: locked.toString(),
              available: (total - locked).toString(),
              updatedAt: balance
                ? new Date(balance.updatedAt * 1000).toISOString()
                : null,
            };
          }),
        ),
      })),
    );

    return reply.send({ network, wallets: rows });
  } catch (error) {
    appLogger.error("Could not read balances from 4mica core", {
      userId,
      error,
    });
    return coreUnavailable(reply);
  }
};
