import type { ActionResult } from "@/actions/shared";

export const runAction = async (
  call: () => Promise<ActionResult>,
): Promise<ActionResult> => {
  try {
    return await call();
  } catch {
    return { ok: false, error: "failed" };
  }
};
