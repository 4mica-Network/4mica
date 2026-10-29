import { getShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

export async function GET() {
  const shop = await getShop();
  return Response.json({
    name: shop.listing.name,
    summary: shop.listing.summary,
    priceLabel: shop.priceLabel,
    payTo: shop.payTo,
  });
}
