import { buildAgentDescriptor } from "@/lib/descriptor";
import {
  descriptorResponse,
  notFoundResponse,
} from "@/services/descriptor-response";
import { resolveAgent } from "@/services/resource";
import { isIndexable } from "@/services/seo";
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
    {
      visible: resolved.agent.visibility === "PUBLIC",
      indexable: isIndexable(resolved.profile, resolved.agent.visibility),
    },
  );
}
