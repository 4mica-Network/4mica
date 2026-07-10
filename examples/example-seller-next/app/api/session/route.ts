export const dynamic = "force-dynamic";

/** Payment-session endpoint — returns the next reqId for a payment (no tabId). */
export async function POST() {
  return Response.json({
    userAddress: "0x2222222222222222222222222222222222222222",
    nextReqId: "0x1",
  });
}
