import { describe, expect, it } from "vitest";
import { groupFilterWhere, parseFilter, userFilterWhere } from "./filter";

describe("parseFilter", () => {
  it("parses eq, co and sw joined by and", () => {
    expect(
      parseFilter(
        'userName eq "a@b.co" AND emails.value co "b" and displayName sw "A\\"x"',
      ),
    ).toEqual([
      { attribute: "username", operator: "eq", value: "a@b.co" },
      { attribute: "emails.value", operator: "co", value: "b" },
      { attribute: "displayname", operator: "sw", value: 'A"x' },
    ]);
  });

  it("strips the core schema URN from attribute paths", () => {
    expect(
      parseFilter('urn:ietf:params:scim:schemas:core:2.0:User:userName eq "x"'),
    ).toEqual([{ attribute: "username", operator: "eq", value: "x" }]);
  });

  it.each([
    "",
    "userName",
    'userName pr "x"',
    'userName eq "x" and',
  ])("rejects %j", (input) => {
    expect(() => parseFilter(input)).toThrow(
      expect.objectContaining({ status: 400, scimType: "invalidFilter" }),
    );
  });
});

describe("filter translation", () => {
  it("matches users case-insensitively except externalId", () => {
    expect(
      userFilterWhere(
        parseFilter('userName sw "ada" and externalId eq "X1" and id eq "u1"'),
      ),
    ).toEqual([
      { user: { email: { startsWith: "ada", mode: "insensitive" } } },
      { scimExternalId: { equals: "X1" } },
      { userId: "u1" },
    ]);
  });

  it("matches groups by displayName and externalId", () => {
    expect(
      groupFilterWhere(
        parseFilter('displayName co "eng" and externalId eq "g1"'),
      ),
    ).toEqual([
      { displayName: { contains: "eng", mode: "insensitive" } },
      { externalId: { equals: "g1" } },
    ]);
  });

  it("refuses attributes a resource cannot be filtered on", () => {
    expect(() => groupFilterWhere(parseFilter('userName eq "x"'))).toThrow(
      expect.objectContaining({ scimType: "invalidFilter" }),
    );
    expect(() => userFilterWhere(parseFilter('id co "x"'))).toThrow(
      expect.objectContaining({ scimType: "invalidFilter" }),
    );
  });
});
