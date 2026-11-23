import * as v from "valibot";

const MAX_ENTRIES = 20;

const IdSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/));

const HandleSchema = v.pipe(v.string(), v.maxLength(256));

export const RevalidateBodySchema = v.object({
  ownerId: v.optional(IdSchema),
  username: v.optional(HandleSchema),
  usernames: v.optional(
    v.pipe(v.array(HandleSchema), v.maxLength(MAX_ENTRIES)),
  ),
  resources: v.optional(
    v.pipe(
      v.array(
        v.object({
          kind: v.picklist(["listing", "agent"] as const),
          id: IdSchema,
        }),
      ),
      v.maxLength(MAX_ENTRIES),
    ),
  ),
});

export type RevalidateBody = v.InferOutput<typeof RevalidateBodySchema>;
