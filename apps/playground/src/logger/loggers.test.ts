import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "winston";
import Transport from "winston-transport";

vi.mock("server-only", () => ({}));

const { jsonFormat } = await import("./loggers");

const MESSAGE = Symbol.for("message");

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.c2lnbmF0dXJlLXZhbHVl";

class Capture extends Transport {
  lines: string[] = [];

  override log(info: Record<string | symbol, unknown>, next: () => void) {
    this.lines.push(String(info[MESSAGE]));
    next();
  }
}

const capture = new Capture();
const logger = createLogger({
  level: "debug",
  format: jsonFormat,
  transports: [capture],
});

const lastLine = () => JSON.parse(capture.lines.at(-1) ?? "{}");

afterEach(() => {
  capture.lines.length = 0;
});

describe("production JSON log format", () => {
  it("scrubs values interpolated with %s, which splat applies", () => {
    logger.warn("login failed for %s using %s", "mo@example.com", JWT);

    const line = capture.lines.at(-1) ?? "";
    expect(line).not.toContain("mo@example.com");
    expect(line).not.toContain("eyJ");
    expect(lastLine().message).toBe(
      "login failed for [Filtered] using [Filtered]",
    );
  });

  it("scrubs error messages and stacks passed as the log message", () => {
    logger.error(new Error(`upstream rejected ${JWT}`));

    const line = capture.lines.at(-1) ?? "";
    expect(line).not.toContain("eyJ");
    expect(lastLine().stack).toContain("[Filtered]");
  });

  it("keeps allowlisted fields and replaces everything else", () => {
    logger.info("payment created", {
      requestId: "0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c",
      paymentUrl: "https://example.com/pay/secret-value",
      metadata: { customField: "sensitive but unrecognized" },
    });

    const line = lastLine();
    expect(line.requestId).toBe("0f3a9c2b-7e8d-4f1a-0b2c-3d4e5f6a7b8c");
    expect(line.paymentUrl).toBe("[Filtered: field not allowlisted]");
    expect(line.metadata).toBe("[Filtered: field not allowlisted]");
    expect(JSON.stringify(line)).not.toContain("secret-value");
  });

  it("keeps only the error shape for objects merged in through splat", () => {
    logger.warn("retrying %s", "request", {
      error: { message: "token=abc", requestBody: { card: "4242" } },
    });

    expect(lastLine().error).toEqual({ message: "token=[Filtered]" });
  });
});
