export interface Tokens {
  PROJECT_NAME: string;
  DESCRIPTION: string;
  PORT: string;
  TMPFILE: string;
}

/** Replace every __TOKEN__ placeholder in a text file body. */
export function substitute(body: string, tokens: Tokens): string {
  const table = tokens as unknown as Record<string, string>;
  return body.replace(/__([A-Z_]+)__/g, (match, key: string) => {
    const value = table[key];
    return value === undefined ? match : value;
  });
}

/** Turn an arbitrary string into a safe npm package name. */
export function toPackageName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-~._]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return cleaned || "my-4mica-app";
}
