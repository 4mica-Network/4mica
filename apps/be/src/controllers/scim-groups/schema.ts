import * as v from "valibot";

const mappableRole = v.picklist(["ADMIN", "DEVELOPER", "VIEWER", "FINANCE"]);

export const UpdateScimGroupSchema = v.pipe(
  v.object({
    role: v.optional(v.nullable(mappableRole)),
    customRoleId: v.optional(v.nullable(v.pipe(v.string(), v.uuid()))),
    priority: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(-1000), v.maxValue(1000)),
    ),
  }),
  v.check(
    (input) => !(input.role && input.customRoleId),
    "map a group to a role or to a custom role, not both",
  ),
);

export type UpdateScimGroupInput = v.InferOutput<typeof UpdateScimGroupSchema>;
