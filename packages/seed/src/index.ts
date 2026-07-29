import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: fileURLToPath(new URL("../../../apps/be/.env", import.meta.url)),
  quiet: true,
});
loadEnv({ quiet: true });

const { disconnect, prisma } = await import("@4mica/db");

const AGENTS = [
  {
    name: "Atlas Research Agent",
    walletAddress: "0x1111111111111111111111111111111111111111",
    status: "ACTIVE",
    creditLimit: "2500",
  },
  {
    name: "Helios Trading Agent",
    walletAddress: "0x2222222222222222222222222222222222222222",
    status: "ACTIVE",
    creditLimit: "10000",
  },
  {
    name: "Vega Settlement Agent",
    walletAddress: "0x3333333333333333333333333333333333333333",
    status: "PENDING",
    creditLimit: "0",
  },
  {
    name: "Orion Data Agent",
    walletAddress: "0x4444444444444444444444444444444444444444",
    status: "SUSPENDED",
    creditLimit: "500",
  },
] as const;

const seed = async (): Promise<void> => {
  for (const agent of AGENTS) {
    await prisma.agent.upsert({
      where: { walletAddress: agent.walletAddress },
      update: {
        name: agent.name,
        status: agent.status,
        creditLimit: agent.creditLimit,
      },
      create: {
        name: agent.name,
        walletAddress: agent.walletAddress,
        status: agent.status,
        creditLimit: agent.creditLimit,
      },
    });
  }

  const total = await prisma.agent.count();

  console.info(
    `[@4mica/seed] upserted ${AGENTS.length} agents (${total} rows total).`,
  );
};

try {
  await seed();
} catch (error) {
  console.error("[@4mica/seed] seeding failed:", error);
  process.exitCode = 1;
} finally {
  await disconnect();
}
