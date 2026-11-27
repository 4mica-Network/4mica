import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MockPlatform, mockPlatform } from "../test/platform.js";
import { pollForToken } from "./device-flow.js";
import { resolvePlatform } from "./platform.js";

let platform: MockPlatform;
beforeEach(async () => {
  platform = await mockPlatform();
});
afterEach(async () => {
  await platform.close();
});

describe("polling for the token", () => {
  it("stops at the deadline set when the code was issued, even mid-request", async () => {
    platform.polls.push("hang");
    const started = Date.now();

    await expect(
      pollForToken(
        resolvePlatform({ FOURMICA_API_URL: platform.url }),
        { device_code: "device-code-1", interval: 1 },
        started + 2500,
        () => {},
      ),
    ).rejects.toMatchObject({ code: "LOGIN_EXPIRED" });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
