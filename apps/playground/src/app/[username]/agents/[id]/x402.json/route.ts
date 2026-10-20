import { buildAgentDescriptor } from "@/lib/descriptor";
import {
  descriptorResponse,
  notFoundResponse,
} from "@/services/descriptor-response";
import { resolveAgent } from "@/services/resource";
import type { ProfileChildPageProps } from "@/types";

export async function GET(
  _request: Request,
  { params }: ProfileChildPageProps,
) {
  const resolved = await resolveAgent(await params);

  if (!resolved) {
    return notFoundResponse();
  }

  return descriptorResponse(
    buildAgentDescriptor(resolved.agent, resolved.profile),
    resolved.agent.visibility === "PUBLIC",
  );
}
