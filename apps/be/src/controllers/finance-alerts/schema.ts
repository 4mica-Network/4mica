import { MAX_PAGE_SIZE, positiveInt } from "@controllers/schema-primitives";
import * as v from "valibot";

export const FinancialAlertKindSchema = v.picklist([
  "BUDGET_THRESHOLD",
  "UNAUTHORIZED_SPEND",
  "POLICY_DENIAL",
  "APPROVAL_REQUESTED",
]);

export const ListAlertsQuerySchema = v.object({
  acknowledged: v.optional(
    v.pipe(
      v.union([v.boolean(), v.picklist(["true", "false"])]),
      v.transform((value) => value === true || value === "true"),
    ),
  ),
  kind: v.optional(FinancialAlertKindSchema),
  cursor: v.optional(v.pipe(v.string(), v.trim(), v.uuid("must be a UUID"))),
  limit: positiveInt(50, MAX_PAGE_SIZE),
});
