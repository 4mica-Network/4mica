import { singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

export const CreateScimTokenSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(120),
    singleLine,
  ),
});
