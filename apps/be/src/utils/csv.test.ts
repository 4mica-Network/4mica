import { describe, expect, it } from "vitest";
import { csvCell, csvDocument, csvLine } from "./csv";

describe("csv", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("abc")).toBe("abc");
    expect(csvCell(12)).toBe("12");
    expect(csvCell("0.01")).toBe("0.01");
  });

  it("writes nothing for a missing value", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("writes dates as ISO timestamps", () => {
    expect(csvCell(new Date("2026-11-01T00:00:00Z"))).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });

  it.each([
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["line\nbreak", '"line\nbreak"'],
    ["carriage\rreturn", '"carriage\rreturn"'],
  ])("quotes %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each([
    ["=1+1", "'=1+1"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ['=HYPERLINK("http://x","y")', `"'=HYPERLINK(""http://x"",""y"")"`],
  ])("neutralises the formula %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it("does not touch a formula character later in the cell", () => {
    expect(csvCell("a=b")).toBe("a=b");
  });

  it("ends every line with CRLF", () => {
    expect(csvLine(["a", null, "b"])).toBe("a,,b\r\n");
  });

  it("puts the header first", () => {
    expect(
      csvDocument(
        ["id", "note"],
        [
          ["1", "x"],
          ["2", "y,z"],
        ],
      ),
    ).toBe('id,note\r\n1,x\r\n2,"y,z"\r\n');
  });
});
