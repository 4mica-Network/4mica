import "server-only";

import { cache } from "react";
import type { PaymentNetwork } from "@/schema/params";
import { prisma } from "./db";
import { getViewer } from "./viewer";

export type PayerState =
  | { step: "signed-out" }
  | { step: "no-wallet" }
  | { step: "wrong-network"; networks: PaymentNetwork[] }
  | { step: "ready"; address: string };

export const getPayerState = cache(
  async (network: PaymentNetwork | null): Promise<PayerState> => {
    const viewer = await getViewer();

    if (!viewer) {
      return { step: "signed-out" };
    }

    const wallets = await prisma.wallet.findMany({
      where: {
        ownerId: viewer.id,
        status: "ACTIVE",
        role: { in: ["PAYER", "BOTH"] },
      },
      select: { address: true, network: true },
    });

    if (wallets.length === 0) {
      return { step: "no-wallet" };
    }

    if (!network) {
      return { step: "ready", address: wallets[0].address };
    }

    const onChain = wallets.find((wallet) => wallet.network === network);

    return onChain
      ? { step: "ready", address: onChain.address }
      : {
          step: "wrong-network",
          networks: [...new Set(wallets.map((wallet) => wallet.network))],
        };
  },
);
