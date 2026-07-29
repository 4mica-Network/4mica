import "dotenv/config";
import { appLogger } from "./logger/index";
import { runServer } from "./server";

runServer().catch((error: unknown) => {
  appLogger.error("Failed to start @4mica/be", { error });
  process.exit(1);
});
