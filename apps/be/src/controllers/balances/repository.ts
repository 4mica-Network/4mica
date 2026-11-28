import { type PaymentNetwork, prisma } from "@4mica/db";

export const activeWalletsOn = (orgId: string, network: PaymentNetwork) =>
  prisma.wallet.findMany({
    where: { organizationId: orgId, network, status: "ACTIVE" },
    select: { id: true, label: true, address: true, role: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
