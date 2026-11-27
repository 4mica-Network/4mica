import { isoInstant, rangeStart } from "@controllers/finance/schema";
import { publicHttpsUrl, singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

export const MAX_STREAMS = 10;
export const MAX_PREFIXES = 20;
export const BACKFILL_MAX_DAYS = 90;

const DAY_MS = 86_400_000;

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "a name is required"),
  v.maxLength(120),
  singleLine,
);

const url = publicHttpsUrl(2048);

const actionPrefixes = v.pipe(
  v.array(
    v.pipe(
      v.string(),
      v.trim(),
      v.toLowerCase(),
      v.minLength(1),
      v.maxLength(64),
      v.regex(/^[a-z0-9_.]+$/, "must be an audit action or its prefix"),
    ),
  ),
  v.maxLength(MAX_PREFIXES),
  v.transform((values) => [...new Set(values)].sort()),
);

const backfillFrom = v.pipe(
  isoInstant,
  v.transform(rangeStart),
  v.check(
    (date) => date.getTime() >= Date.now() - BACKFILL_MAX_DAYS * DAY_MS,
    `can reach back at most ${BACKFILL_MAX_DAYS} days`,
  ),
  v.check((date) => date.getTime() <= Date.now(), "must be in the past"),
);

export const CreateStreamSchema = v.object({
  name,
  url,
  actionPrefixes: v.optional(actionPrefixes, []),
  backfillFrom: v.optional(backfillFrom),
});

export const UpdateStreamSchema = v.pipe(
  v.object({
    name: v.optional(name),
    url: v.optional(url),
    actionPrefixes: v.optional(actionPrefixes),
    status: v.optional(v.literal("PAUSED")),
  }),
  v.check(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "nothing to update",
  ),
);

export type CreateStreamInput = v.InferOutput<typeof CreateStreamSchema>;
export type UpdateStreamInput = v.InferOutput<typeof UpdateStreamSchema>;
