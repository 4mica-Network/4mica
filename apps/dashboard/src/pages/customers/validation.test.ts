import { blankToNull } from "@utils/format";
import { describe, expect, it } from "vitest";
import { createCustomerSchema, identitySchema } from "./validation";

const PAYER = "0x8a1c3f5b7d092e4a6c8b0d2f4e6a8c1b3d5f7e90";

const base = {
  name: "Acme Procurement",
  email: "",
  type: "ORGANIZATION" as const,
  status: "ACTIVE" as const,
  description: "",
  notes: "",
  network: "" as const,
  address: "",
  dailyLimit: "",
  monthlyLimit: "",
  limitCurrency: "USD",
};

const firstIssue = (result: { success: boolean; error?: unknown }) =>
  (result.error as { issues: { path: unknown[]; message: string }[] })
    .issues[0];

describe("createCustomerSchema", () => {
  it("accepts a customer with no wallet at all", () => {
    expect(createCustomerSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a complete network and address pair", () => {
    const result = createCustomerSchema.safeParse({
      ...base,
      network: "BASE_SEPOLIA",
      address: PAYER,
    });

    expect(result.success).toBe(true);
  });

  it("refuses an address with no network", () => {
    const result = createCustomerSchema.safeParse({ ...base, address: PAYER });

    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("customer.errors.networkRequired");
  });

  it("refuses a network with no address", () => {
    const result = createCustomerSchema.safeParse({
      ...base,
      network: "BASE_SEPOLIA",
    });

    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("customer.errors.addressRequired");
  });

  it("refuses an address that fails its checksum", () => {
    const result = createCustomerSchema.safeParse({
      ...base,
      network: "BASE_SEPOLIA",
      address: "0x8A1C3f5b7d092E4a6C8b0d2f4e6A8c1b3d5F7e90",
    });

    expect(result.success).toBe(false);
  });

  it("requires a name", () => {
    const result = createCustomerSchema.safeParse({ ...base, name: "  " });

    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("customer.errors.nameRequired");
  });

  it("refuses a negative limit", () => {
    expect(
      createCustomerSchema.safeParse({ ...base, monthlyLimit: "-5" }).success,
    ).toBe(false);
  });

  it("refuses a limit that is not a plain number", () => {
    expect(
      createCustomerSchema.safeParse({ ...base, dailyLimit: "1,000" }).success,
    ).toBe(false);
  });

  it("reports validation failures as i18n keys, not prose", () => {
    const result = createCustomerSchema.safeParse({ ...base, name: "" });

    expect(firstIssue(result).message).toMatch(/^customer\.errors\./);
  });
});

describe("identitySchema", () => {
  it("requires a network and address on a wallet", () => {
    const result = identitySchema.safeParse({ type: "WALLET", value: "" });

    expect(result.success).toBe(false);
  });

  it("requires a value on an email identity", () => {
    const result = identitySchema.safeParse({ type: "EMAIL", value: "" });

    expect(result.success).toBe(false);
  });

  it("refuses an email identity that is not an email", () => {
    const result = identitySchema.safeParse({
      type: "EMAIL",
      value: "not-an-email",
    });

    expect(result.success).toBe(false);
    expect(firstIssue(result).message).toBe("customer.errors.emailInvalid");
  });

  it("accepts an external id that is any non-blank string", () => {
    const result = identitySchema.safeParse({
      type: "EXTERNAL",
      value: "cus_N8vY1234",
    });

    expect(result.success).toBe(true);
  });
});

describe("blankToNull", () => {
  it("turns a blank or whitespace field into null", () => {
    expect(blankToNull("")).toBeNull();
    expect(blankToNull("   ")).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
  });

  it("trims a value it keeps", () => {
    expect(blankToNull("  Acme  ")).toBe("Acme");
  });
});
