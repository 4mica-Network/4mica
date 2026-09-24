import { LinkConfig } from "@4mica/url";
import { publicEnv } from "@/env";

export const links = new LinkConfig({
  NEXT_PUBLIC_BASE_URL: publicEnv.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_APP_URL: publicEnv.NEXT_PUBLIC_APP_URL,
}).links;
