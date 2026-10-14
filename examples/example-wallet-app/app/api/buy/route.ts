import { pay } from "@/lib/wallet";

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url: string };
    return Response.json(await pay(url));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
