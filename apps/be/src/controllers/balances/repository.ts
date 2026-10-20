import { type PaymentNetwork, prisma } from "@4mica/db";

export const activeWalletsOn = (ownerId: string, network: PaymentNetwork) =>
  prisma.wallet.findMany({
    where: { ownerId, network, status: "ACTIVE" },
    select: { id: true, label: true, address: true, role: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
