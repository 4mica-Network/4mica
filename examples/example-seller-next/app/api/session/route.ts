export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({
    userAddress: "0x2222222222222222222222222222222222222222",
    nextReqId: "0x1",
  });
}
