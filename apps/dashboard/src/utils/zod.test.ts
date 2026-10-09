import { describe, expect, it } from "vitest";
import {
  addressOrBlank,
  httpsUrl,
  orBlank,
  positiveAmount,
  slugOrBlank,
} from "./zod";

const firstMessage = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("zod field factories", () => {
  it("namespaces https url errors", () => {
    const schema = httpsUrl("ns");
    expect(schema.safeParse("https://x.example").success).toBe(true);
    expect(firstMessage(schema.safeParse("http://x.example"))).toBe(
      "ns.urlHttps",
    );
    expect(firstMessage(schema.safeParse("nope"))).toBe("ns.urlInvalid");
  });

  it("requires a positive decimal amount", () => {
    const schema = positiveAmount("ns");
    expect(schema.safeParse("1.5").success).toBe(true);
    expect(firstMessage(schema.safeParse("0"))).toBe("ns.pricePositive");
    expect(firstMessage(schema.safeParse("01"))).toBe("ns.priceInvalid");
  });

  it("accepts blanks where orBlank is used", () => {
    expect(orBlank(httpsUrl("ns")).safeParse("").success).toBe(true);
    expect(addressOrBlank("bad").safeParse("").success).toBe(true);
    expect(firstMessage(addressOrBlank("bad").safeParse("0x1"))).toBe("bad");
  });

  it("lowercases slugs and rejects uuid-shaped ones", () => {
    expect(slugOrBlank("ns").parse("My-Agent")).toBe("my-agent");
    expect(
      firstMessage(
        slugOrBlank("ns").safeParse("0f8fad5b-d9cb-469f-a165-70867728950e"),
      ),
    ).toBe("ns.slugIdShaped");
  });
});
