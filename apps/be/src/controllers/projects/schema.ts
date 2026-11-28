import { isValidSlug, SLUG_MESSAGE } from "@4mica/rules";
import { singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

export const PROJECT_ROLES = ["ADMIN", "DEVELOPER", "VIEWER"] as const;
export const MOVABLE_KINDS = [
  "agent",
  "api_listing",
  "webhook",
  "customer",
] as const;
export const MAX_MOVE = 100;

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "a name is required"),
  v.maxLength(120),
  singleLine,
);

const slug = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.check(isValidSlug, SLUG_MESSAGE),
);

const description = v.nullable(
  v.pipe(v.string(), v.trim(), v.maxLength(280), singleLine),
);

export const CreateProjectSchema = v.object({
  name,
  slug: v.optional(slug),
  description: v.optional(description),
  restricted: v.optional(v.boolean(), false),
});

export const UpdateProjectSchema = v.pipe(
  v.object({
    name: v.optional(name),
    slug: v.optional(slug),
    description: v.optional(description),
    restricted: v.optional(v.boolean()),
    restrictProduction: v.optional(v.boolean()),
  }),
  v.check(
    (value) => Object.values(value).some((field) => field !== undefined),
    "nothing to update",
  ),
);

export const SetProjectMemberSchema = v.object({
  role: v.picklist(PROJECT_ROLES),
});

export const MoveResourcesSchema = v.object({
  kind: v.picklist(MOVABLE_KINDS),
  ids: v.pipe(
    v.array(v.pipe(v.string(), v.uuid())),
    v.minLength(1),
    v.maxLength(MAX_MOVE),
    v.transform((ids) => [...new Set(ids)]),
  ),
  targetProjectId: v.pipe(v.string(), v.uuid()),
});

export type MovableKind = (typeof MOVABLE_KINDS)[number];
export type UpdateProjectInput = v.InferOutput<typeof UpdateProjectSchema>;
