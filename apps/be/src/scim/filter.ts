import { ScimError } from "./errors";

export type FilterOperator = "eq" | "co" | "sw";

export interface Comparison {
  attribute: string;
  operator: FilterOperator;
  value: string;
}

export type Filter = Comparison[];

const OPERATORS: ReadonlySet<string> = new Set(["eq", "co", "sw"]);

const invalid = (detail: string) => new ScimError(400, detail, "invalidFilter");

type Token =
  | { kind: "word"; text: string }
  | { kind: "string"; text: string }
  | { kind: "open" }
  | { kind: "close" };

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index] ?? "";

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ kind: "open" });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: "close" });
      index += 1;
      continue;
    }

    if (char === '"') {
      let text = "";
      index += 1;
      let closed = false;
      while (index < input.length) {
        const next = input[index] ?? "";
        if (next === "\\") {
          const escaped = input[index + 1];
          if (escaped === undefined) {
            break;
          }
          text += escaped;
          index += 2;
          continue;
        }
        if (next === '"') {
          closed = true;
          index += 1;
          break;
        }
        text += next;
        index += 1;
      }
      if (!closed) {
        throw invalid("The filter has an unterminated string.");
      }
      tokens.push({ kind: "string", text });
      continue;
    }

    const match = /^[^\s()"]+/.exec(input.slice(index));
    if (!match) {
      throw invalid("The filter could not be parsed.");
    }
    tokens.push({ kind: "word", text: match[0] });
    index += match[0].length;
  }

  return tokens;
};

const normalizeAttribute = (raw: string): string => {
  const path = raw.replace(
    /^urn:ietf:params:scim:schemas:core:2\.0:(User|Group):/i,
    "",
  );
  return path.toLowerCase();
};

export const parseFilter = (input: string): Filter => {
  const tokens = tokenize(input.trim()).filter(
    (token) => token.kind !== "open" && token.kind !== "close",
  );

  if (tokens.length === 0) {
    throw invalid("The filter is empty.");
  }

  const comparisons: Comparison[] = [];
  let index = 0;

  while (index < tokens.length) {
    const attribute = tokens[index];
    const operator = tokens[index + 1];
    const value = tokens[index + 2];

    if (attribute?.kind !== "word" || operator?.kind !== "word") {
      throw invalid("Expected `attribute operator value`.");
    }

    const op = operator.text.toLowerCase();
    if (!OPERATORS.has(op)) {
      throw invalid(
        `The ${operator.text} operator is not supported. Use eq, co or sw.`,
      );
    }

    if (value?.kind !== "string") {
      throw invalid("Filter values must be quoted strings.");
    }

    comparisons.push({
      attribute: normalizeAttribute(attribute.text),
      operator: op as FilterOperator,
      value: value.text,
    });
    index += 3;

    const joiner = tokens[index];
    if (joiner === undefined) {
      break;
    }
    if (joiner.kind !== "word" || joiner.text.toLowerCase() !== "and") {
      throw invalid("Only `and` can join filter expressions.");
    }
    index += 1;
    if (index >= tokens.length) {
      throw invalid("The filter ends with a dangling `and`.");
    }
  }

  return comparisons;
};

type StringMatch =
  | { equals: string; mode?: "insensitive" }
  | { contains: string; mode?: "insensitive" }
  | { startsWith: string; mode?: "insensitive" };

const stringMatch = (
  { operator, value }: Comparison,
  caseExact: boolean,
): StringMatch => {
  const mode = caseExact ? {} : { mode: "insensitive" as const };
  switch (operator) {
    case "eq":
      return { equals: value, ...mode };
    case "co":
      return { contains: value, ...mode };
    case "sw":
      return { startsWith: value, ...mode };
  }
};

const idOnly = (comparison: Comparison): string => {
  if (comparison.operator !== "eq") {
    throw invalid("Only `eq` is supported on id.");
  }
  return comparison.value;
};

export const userFilterWhere = (filter: Filter) =>
  filter.map((comparison) => {
    switch (comparison.attribute) {
      case "username":
      case "emails.value":
      case "emails":
        return { user: { email: stringMatch(comparison, false) } };
      case "externalid":
        return { scimExternalId: stringMatch(comparison, true) };
      case "displayname":
      case "name.formatted":
        return { user: { name: stringMatch(comparison, false) } };
      case "id":
        return { userId: idOnly(comparison) };
      default:
        throw invalid(`Users cannot be filtered on ${comparison.attribute}.`);
    }
  });

export const groupFilterWhere = (filter: Filter) =>
  filter.map((comparison) => {
    switch (comparison.attribute) {
      case "displayname":
        return { displayName: stringMatch(comparison, false) };
      case "externalid":
        return { externalId: stringMatch(comparison, true) };
      case "id":
        return { id: idOnly(comparison) };
      default:
        throw invalid(`Groups cannot be filtered on ${comparison.attribute}.`);
    }
  });
