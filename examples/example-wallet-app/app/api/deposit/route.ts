import { parseEther } from "viem";
import { getWallet } from "@/lib/wallet";

export async function POST(request: Request) {
  try {
    const { amount } = (await request.json()) as { amount: string };
    const client = await getWallet();
    const { txHash } = await client.deposit
      .of(null, parseEther(String(amount)))
      .send();
    return Response.json({ txHash });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
