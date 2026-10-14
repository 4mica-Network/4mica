import { challengeFor, priceLabel } from "@/lib/wallet";

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url: string };
    const challenge = await challengeFor(url);
    if (!challenge) {
      return Response.json(
        { error: "That URL is not for sale." },
        { status: 400 },
      );
    }

    const accepted = challenge.accepts[0];
    return Response.json({
      price: priceLabel(accepted.amount, accepted.asset),
      network: accepted.network,
      payTo: accepted.payTo,
      description: challenge.resource?.description ?? null,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
