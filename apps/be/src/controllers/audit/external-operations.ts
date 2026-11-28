import {
  type ExternalOperationInput,
  type ExternalOperationOutcome,
  settleExternalOperation,
  startExternalOperation,
} from "@controllers/audit/repository";
import { appLogger } from "@logger/index";

type Failure = Exclude<ExternalOperationOutcome, "SUCCEEDED">;

export const clerkOutcome = (error: unknown): Failure => {
  const status =
    typeof error === "object" && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  return typeof status === "number" && status >= 400 && status < 500
    ? "FAILED"
    : "UNKNOWN";
};

const settle = async (
  id: string,
  status: ExternalOperationOutcome,
  error?: unknown,
) => {
  try {
    await settleExternalOperation(
      id,
      status,
      error === undefined
        ? null
        : (error instanceof Error ? error.message : String(error)).slice(
            0,
            500,
          ),
    );
  } catch (failure) {
    appLogger.error(
      "Could not settle an external operation; it stays PENDING",
      {
        externalOperationId: id,
        status,
        error: failure,
      },
    );
  }
};

export const trackExternalOperation = async <T>(
  input: ExternalOperationInput,
  run: () => Promise<T>,
  outcome: (error: unknown) => Failure = clerkOutcome,
): Promise<T> => {
  const { id } = await startExternalOperation(input);

  let result: T;
  try {
    result = await run();
  } catch (error) {
    await settle(id, outcome(error), error);
    throw error;
  }
  await settle(id, "SUCCEEDED");
  return result;
};
