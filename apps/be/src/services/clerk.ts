import { createClerkClient } from "@clerk/backend";
import { config } from "@config/index";

export const clerk = createClerkClient({
  secretKey: config.env.CLERK_SECRET_KEY,
  publishableKey: config.env.CLERK_PUBLISHABLE_KEY,
});
