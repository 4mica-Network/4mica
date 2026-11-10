import "server-only";

import { headers } from "next/headers";
import { handleFromPath } from "@/utils/handleFromPath";
import { PATHNAME_HEADER } from "@/utils/pathnameHeader";
import { prisma } from "./db";

export const unclaimedHandleInRequest = async (): Promise<string | null> => {
  const handle = handleFromPath((await headers()).get(PATHNAME_HEADER));
  if (!handle) {
    return null;
  }

  const owner = await prisma.user.findUnique({
    where: { username: handle },
    select: { id: true },
  });
  return owner ? null : handle;
};
