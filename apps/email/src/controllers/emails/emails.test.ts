import { templateIds, templatePath } from "@4mica/email-client";
import { emailRoutes } from "@routes/emails";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const { sendTemplate, EmailSendError } = vi.hoisted(() => {
  class HoistedEmailSendError extends Error {
    readonly templateId: string;

    constructor(templateId: string, message: string) {
      super(message);
      this.name = "EmailSendError";
      this.templateId = templateId;
    }
  }

  return {
    sendTemplate: vi.fn(),
    EmailSendError: HoistedEmailSendError,
  };
});

vi.mock("@services/resend", () => ({ sendTemplate, EmailSendError }));

const build = () => initApp([{ plugin: emailRoutes }]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /emails/:template", () => {
  it("accepts a valid payload and echoes the send result", async () => {
    sendTemplate.mockResolvedValue({
      id: "msg_1",
      templateId: "welcome",
      dryRun: true,
    });
    const app = await build();

    const response = await app.inject({
      method: "POST",
      url: "/emails/welcome",
      payload: { to: "ada@4mica.io", userName: "Ada" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      id: "msg_1",
      templateId: "welcome",
      dryRun: true,
    });
    expect(sendTemplate).toHaveBeenCalledWith(
      "welcome",
      expect.objectContaining({ to: "ada@4mica.io", userName: "Ada" }),
    );

    await app.close();
  });

  it("applies schema defaults before rendering", async () => {
    sendTemplate.mockResolvedValue({
      id: "m",
      templateId: "welcome",
      dryRun: true,
    });
    const app = await build();

    await app.inject({
      method: "POST",
      url: "/emails/welcome",
      payload: { to: "ada@4mica.io" },
    });

    expect(sendTemplate).toHaveBeenCalledWith(
      "welcome",
      expect.objectContaining({ userName: "there" }),
    );

    await app.close();
  });

  it("rejects a malformed body with the shared error envelope", async () => {
    const app = await build();

    const response = await app.inject({
      method: "POST",
      url: "/emails/welcome",
      payload: { to: "not-an-email" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("invalid_request");
    expect(body.issues).toEqual([
      { path: "to", message: "Must be a valid email address" },
    ]);
    expect(sendTemplate).not.toHaveBeenCalled();

    await app.close();
  });

  it("reports a required field that is missing entirely", async () => {
    const app = await build();

    const response = await app.inject({
      method: "POST",
      url: "/emails/workspace-invite",
      payload: { to: "ada@4mica.io" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(["workspaceName", "inviteUrl"]),
    );

    await app.close();
  });

  it("maps a provider failure to 502 without leaking internals", async () => {
    sendTemplate.mockRejectedValue(
      new EmailSendError("welcome", "Domain is not verified"),
    );
    const app = await build();

    const response = await app.inject({
      method: "POST",
      url: "/emails/welcome",
      payload: { to: "ada@4mica.io" },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "email_send_failed",
      message: "Domain is not verified",
    });

    await app.close();
  });

  it("hides the detail of an unexpected error", async () => {
    sendTemplate.mockRejectedValue(new Error("ECONNRESET at 10.0.0.4:443"));
    const app = await build();

    const response = await app.inject({
      method: "POST",
      url: "/emails/welcome",
      payload: { to: "ada@4mica.io" },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().message).toBe(
      "The email provider rejected the message.",
    );

    await app.close();
  });

  it("registers a route for every template in the contract", async () => {
    sendTemplate.mockResolvedValue({
      id: "m",
      templateId: "welcome",
      dryRun: true,
    });
    const app = await build();

    for (const id of templateIds) {
      const response = await app.inject({
        method: "POST",
        url: templatePath(id),
        payload: {},
      });

      expect(response.statusCode, `${id} has no route`).toBe(400);
    }

    await app.close();
  });

  it("404s on an unknown template", async () => {
    const app = await build();

    const response = await app.inject({
      method: "POST",
      url: "/emails/does-not-exist",
      payload: { to: "ada@4mica.io" },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
