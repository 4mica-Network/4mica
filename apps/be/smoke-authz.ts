import "dotenv/config";
import { disconnect, prisma } from "@4mica/db";
import { clearUserCache, loadUser } from "./src/auth/user-store";

const CLERK_ID = "user_3HSt8lwDKmxT0M3wrUXajEQEX5N";
const ok = (label: string, pass: boolean) =>
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);

const identity = {
  clerkUserId: CLERK_ID,
  sessionId: "sess_probe",
  email: null,
  name: null,
  avatarUrl: null,
};

const main = async () => {
  const row = await prisma.user.findUnique({
    where: { clerkUserId: CLERK_ID },
  });
  if (!row) {
    console.log("no user row; sign in first");
    return;
  }

  clearUserCache();
  const active = await loadUser(identity);
  ok("active account resolves as enabled", active.disabled === false);

  for (const [label, patch] of [
    ["banned", { banned: true }],
    ["locked", { locked: true }],
    ["soft-deleted", { deletedAt: new Date() }],
  ] as const) {
    await prisma.user.update({ where: { id: row.id }, data: patch });
    clearUserCache();
    const user = await loadUser(identity);
    ok(`${label} account resolves as disabled`, user.disabled === true);

    await prisma.user.update({
      where: { id: row.id },
      data: { banned: false, locked: false, deletedAt: null },
    });
  }

  clearUserCache();
  const restored = await loadUser(identity);
  ok("account restored to enabled", restored.disabled === false);

  const final = await prisma.user.findUnique({ where: { id: row.id } });
  ok(
    "no flags left set",
    final?.banned === false &&
      final?.locked === false &&
      final?.deletedAt === null,
  );

  await disconnect();
};

main().catch((error) => {
  console.error("FAILED", error);
  process.exitCode = 1;
});
