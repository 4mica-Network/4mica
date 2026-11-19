import "server-only";

import { headers } from "next/headers";
import { NONCE_HEADER } from "./csp";

export const getNonce = async (): Promise<string | undefined> =>
  (await headers()).get(NONCE_HEADER) ?? undefined;
