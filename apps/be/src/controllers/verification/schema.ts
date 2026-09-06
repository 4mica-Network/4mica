import * as v from "valibot";

export const VerifyEmailQuerySchema = v.object({
  token: v.pipe(v.string(), v.trim(), v.minLength(1, "token is required")),
});
