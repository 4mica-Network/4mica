/**
 * The site's addresses. The monorepo keeps these in `@4mica/url`, which is
 * private and so cannot be a dependency of a published package;
 * `links.test.ts` fails when the two disagree.
 */

/**
 * The hosted dashboard. Not `links.app`: that is the address of whichever
 * app is being built, read from its build environment, and is the marketing
 * site when nothing sets it.
 */
export const DASHBOARD_URL = "https://app.4mica.io";

export const DOCS_URL = "https://docs.4mica.io";

/** Where the quickstart explains minting test tokens to a new wallet. */
export const FUNDING_DOCS = `${DOCS_URL}/getting-started/quickstart`;
