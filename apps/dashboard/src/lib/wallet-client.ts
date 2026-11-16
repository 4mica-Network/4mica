import { type Address, createWalletClient, custom } from "viem";

type InjectedProvider = Parameters<typeof custom>[0];

export const signWithInjectedWallet = (
  injected: InjectedProvider,
  account: Address,
  message: string,
): Promise<string> =>
  createWalletClient({ account, transport: custom(injected) }).signMessage({
    account,
    message,
  });
