import "dotenv/config";
import { appLogger } from "./logger/index";
import { runServer } from "./server";

runServer().catch((error: unknown) => {
  appLogger.error("Failed to start @4mica/email", { error });
  process.exit(1);
});
