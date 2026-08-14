import "server-only";

/**
 * The single import site for the Prisma client. Everything that touches the
 * database goes through here, so a stray client-component import fails at build
 * with a clear "server-only" error rather than at runtime.
 */
/** `Prisma` is type-only, for `satisfies` on selects with nested relation args. */
export { type Prisma, prisma } from "@4mica/db";
