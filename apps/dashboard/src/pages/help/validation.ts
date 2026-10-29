import { isSingleLine } from "@4mica/rules";
import { orBlank } from "@utils/zod";
import { z } from "zod";

export const SUBJECT_MAX_LENGTH = 160;
export const BODY_MAX_LENGTH = 5000;
export const REFERENCE_MAX_LENGTH = 255;

export const supportRequestSchema = z.object({
  category: z.string().min(1, "help.errors.categoryRequired"),
  subject: z
    .string()
    .trim()
    .min(1, "help.errors.subjectRequired")
    .max(SUBJECT_MAX_LENGTH, "help.errors.subjectTooLong")
    .refine(isSingleLine, "validation.singleLine"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  description: z
    .string()
    .trim()
    .min(1, "help.errors.descriptionRequired")
    .max(BODY_MAX_LENGTH, "help.errors.descriptionTooLong"),
  reference: orBlank(
    z
      .string()
      .trim()
      .max(REFERENCE_MAX_LENGTH, "help.errors.referenceTooLong")
      .refine(isSingleLine, "validation.singleLine"),
  ),
});

export type SupportRequestValues = z.infer<typeof supportRequestSchema>;

export const CREATE_STEP_FIELDS = [
  ["category"],
  ["subject", "priority", "description", "reference"],
] as const satisfies readonly (readonly (keyof SupportRequestValues)[])[];

export const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "help.errors.replyRequired")
    .max(BODY_MAX_LENGTH, "help.errors.descriptionTooLong"),
});

export type ReplyValues = z.infer<typeof replySchema>;
