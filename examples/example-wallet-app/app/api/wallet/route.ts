import { formatEther } from "viem";
import { getWallet, purchases } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = await getWallet();
  const balance = await client.account.assetBalance(null);
  const total = balance?.total ?? 0n;
  const locked = balance?.locked ?? 0n;

  return Response.json({
    address: client.signerAddress,
    total: formatEther(total),
    locked: formatEther(locked),
    available: formatEther(total - locked),
    purchases,
  });
}
