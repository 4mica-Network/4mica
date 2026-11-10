import { NotFoundView } from "@/components/NotFoundView";
import { unclaimedHandleInRequest } from "@/services/handle";

export default async function NotFound() {
  return <NotFoundView handle={await unclaimedHandleInRequest()} />;
}
