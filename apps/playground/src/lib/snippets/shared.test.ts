import { describe, expect, it } from "vitest";
import { codeString, commentLine, shellQuote, singleLine } from "./shared";

describe("commentLine", () => {
  it("joins the present parts and drops the nulls", () => {
    expect(commentLine(["Credit API", null, "$0.01 per call"])).toBe(
      "// Credit API · $0.01 per call",
    );
  });
});

describe("snippet escaping", () => {
  it("keeps a newline in a value from ending the comment", () => {
    expect(commentLine(["API\nawait steal()"])).toBe("// API await steal()");
    expect(commentLine(["API\r\n x"], "#")).toBe("# API x");
  });

  it("collapses control characters to a single space", () => {
    expect(singleLine("a\t\u0000b")).toBe("a b");
  });

  it("single-quotes shell values so substitutions stay inert", () => {
    expect(shellQuote("https://x.example/$(id)")).toBe(
      "'https://x.example/$(id)'",
    );
    expect(shellQuote("https://x.example/'; rm -rf ~; '")).toBe(
      String.raw`'https://x.example/'\''; rm -rf ~; '\'''`,
    );
  });

  it("escapes quotes and newlines in a code string literal", () => {
    expect(codeString('https://x.example/"); evil(); ("')).toBe(
      String.raw`"https://x.example/\"); evil(); (\""`,
    );
    expect(codeString("a\nb")).toBe(String.raw`"a\nb"`);
  });
});
