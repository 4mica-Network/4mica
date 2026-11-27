import { isPublicHostname } from "@utils/public-host";
import * as v from "valibot";

export const JOIN_ROLES = ["ADMIN", "DEVELOPER", "VIEWER", "FINANCE"] as const;

export const JoinRoleSchema = v.picklist(
  JOIN_ROLES,
  "must be ADMIN, DEVELOPER, VIEWER or FINANCE",
);

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

const isHostname = (value: string) =>
  value.includes(".") &&
  value.split(".").every((label) => LABEL.test(label)) &&
  !/^[0-9.]+$/.test(value) &&
  isPublicHostname(value);

export const domainName = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.transform((value) => value.replace(/\.$/, "")),
  v.minLength(3),
  v.maxLength(253),
  v.check(isHostname, "must be a public domain name such as example.com"),
);

export const CreateDomainSchema = v.object({ domain: domainName });

export const UpdateDomainSchema = v.object({
  autoJoin: v.optional(v.boolean()),
  autoJoinRole: v.optional(JoinRoleSchema),
});

export type UpdateDomainInput = v.InferOutput<typeof UpdateDomainSchema>;
