import * as v from "valibot";
import { invalidValue, ScimError } from "./errors";
import { toBoolean } from "./patch";

const text = v.pipe(v.string(), v.trim());

const looseBoolean = v.union([v.boolean(), v.string()]);

const UserBodySchema = v.looseObject({
  userName: v.pipe(text, v.minLength(1), v.maxLength(255)),
  externalId: v.optional(v.nullable(v.pipe(text, v.maxLength(255)))),
  active: v.optional(looseBoolean),
  displayName: v.optional(v.nullable(text)),
  name: v.optional(
    v.nullable(
      v.looseObject({
        formatted: v.optional(v.nullable(text)),
        givenName: v.optional(v.nullable(text)),
        familyName: v.optional(v.nullable(text)),
      }),
    ),
  ),
  emails: v.optional(
    v.nullable(
      v.array(
        v.looseObject({
          value: text,
          type: v.optional(v.nullable(v.string())),
          primary: v.optional(v.nullable(looseBoolean)),
        }),
      ),
    ),
  ),
});

const GroupBodySchema = v.looseObject({
  displayName: v.pipe(text, v.minLength(1), v.maxLength(255)),
  externalId: v.optional(v.nullable(v.pipe(text, v.maxLength(255)))),
  members: v.optional(
    v.nullable(v.array(v.looseObject({ value: v.pipe(text, v.minLength(1)) }))),
  ),
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value: string) =>
  value.length <= 255 && EMAIL.test(value);

export interface UserInput {
  email: string;
  externalId: string | null | undefined;
  active: boolean;
  givenName: string | null;
  familyName: string | null;
  name: string | null;
}

const parse = <T extends v.GenericSchema>(schema: T, body: unknown) => {
  const result = v.safeParse(schema, body ?? {});
  if (!result.success) {
    const issue = result.issues[0];
    throw new ScimError(
      400,
      `${v.getDotPath(issue) ?? "body"}: ${issue.message}`,
      "invalidValue",
    );
  }
  return result.output as v.InferOutput<T>;
};

export const parseUser = (body: unknown): UserInput => {
  const user = parse(UserBodySchema, body);
  const emails = user.emails ?? [];
  const primary =
    emails.find(
      (entry) =>
        entry.primary !== undefined &&
        entry.primary !== null &&
        toBoolean(entry.primary),
    ) ??
    emails.find((entry) => entry.type === "work") ??
    emails[0];
  const email = isEmail(user.userName) ? user.userName : primary?.value;

  if (!email || !isEmail(email)) {
    throw invalidValue("userName or a primary email must be an email address.");
  }

  const givenName = user.name?.givenName || null;
  const familyName = user.name?.familyName || null;
  const name =
    user.name?.formatted ||
    [givenName, familyName].filter(Boolean).join(" ") ||
    user.displayName ||
    null;

  return {
    email: email.toLowerCase(),
    externalId: user.externalId,
    active: user.active === undefined ? true : toBoolean(user.active),
    givenName,
    familyName,
    name,
  };
};

export interface GroupInput {
  displayName: string;
  externalId: string | null | undefined;
  members: string[];
}

export const parseGroup = (body: unknown): GroupInput => {
  const group = parse(GroupBodySchema, body);
  return {
    displayName: group.displayName,
    externalId: group.externalId,
    members: (group.members ?? []).map((member) => member.value),
  };
};
