import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailClient } from "./client";
import { EmailClientError } from "./errors";
import { templateIds, templatePath, templateSchemas } from "./templates";

const { post, create, isAxiosError } = vi.hoisted(() => ({
  post: vi.fn(),
  create: vi.fn(),
  isAxiosError: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { create },
  isAxiosError,
}));

/** Shapes an object the way axios reports a response error. */
const httpFailure = (status: number, data: unknown) => {
  isAxiosError.mockReturnValue(true);
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    response: { status, data },
  };
};

const transportFailure = () => {
  isAxiosError.mockReturnValue(true);
  return {
    isAxiosError: true,
    message: "connect ECONNREFUSED",
    response: undefined,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  create.mockReturnValue({ post });
  isAxiosError.mockReturnValue(false);
});

describe("EmailClient", () => {
  it("posts the payload to the template's route and returns the message id", async () => {
    post.mockResolvedValue({ data: { id: "msg_123" } });
    const client = new EmailClient("http://email:4100");

    const result = await client.sendWelcome({
      to: "ada@4mica.io",
      userName: "Ada",
    });

    expect(post).toHaveBeenCalledWith("/emails/welcome", {
      to: "ada@4mica.io",
      userName: "Ada",
    });
    expect(result).toEqual({ id: "msg_123", templateId: "welcome" });
  });

  it("configures the axios instance from its options", () => {
    new EmailClient("http://email:4100", {
      timeoutMs: 2_500,
      headers: { "x-request-id": "abc" },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "http://email:4100",
        timeout: 2_500,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "abc",
        },
      }),
    );
  });

  it("throws EmailClientError carrying the server's status, code and issues", async () => {
    post.mockRejectedValue(
      httpFailure(400, {
        error: "invalid_request",
        message: "The request body failed validation.",
        issues: [{ path: "to", message: "Must be a valid email address" }],
      }),
    );
    const client = new EmailClient("http://email:4100", { retries: 0 });

    const error = await client
      .sendWelcome({ to: "nope" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailClientError);
    const emailError = error as EmailClientError;
    expect(emailError.status).toBe(400);
    expect(emailError.code).toBe("invalid_request");
    expect(emailError.templateId).toBe("welcome");
    expect(emailError.issues).toEqual([
      { path: "to", message: "Must be a valid email address" },
    ]);
    expect(emailError.isTransportError).toBe(false);
  });

  it("reports an unreachable service as a transport error", async () => {
    post.mockRejectedValue(transportFailure());
    const client = new EmailClient("http://email:4100", { retries: 0 });

    const error = (await client
      .sendWelcome({ to: "ada@4mica.io" })
      .catch((caught: unknown) => caught)) as EmailClientError;

    expect(error.status).toBe(0);
    expect(error.code).toBe("transport_error");
    expect(error.isTransportError).toBe(true);
  });

  it("resolves to null instead of throwing when throwOnError is false", async () => {
    post.mockRejectedValue(httpFailure(500, { error: "email_send_failed" }));
    const logger = { warn: vi.fn(), error: vi.fn() };
    const client = new EmailClient("http://email:4100", {
      throwOnError: false,
      retries: 0,
      logger,
    });

    await expect(
      client.sendWelcome({ to: "ada@4mica.io" }),
    ).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it("retries a 5xx and succeeds on the follow-up attempt", async () => {
    post
      .mockRejectedValueOnce(httpFailure(503, { error: "service_unavailable" }))
      .mockResolvedValueOnce({ data: { id: "msg_retry" } });
    const client = new EmailClient("http://email:4100", { retries: 2 });

    await expect(client.sendWelcome({ to: "ada@4mica.io" })).resolves.toEqual({
      id: "msg_retry",
      templateId: "welcome",
    });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    post.mockRejectedValue(httpFailure(400, { error: "invalid_request" }));
    const client = new EmailClient("http://email:4100", { retries: 3 });

    await expect(client.sendWelcome({ to: "nope" })).rejects.toBeInstanceOf(
      EmailClientError,
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the budget is exhausted", async () => {
    post.mockRejectedValue(transportFailure());
    const client = new EmailClient("http://email:4100", { retries: 2 });

    await expect(
      client.sendWelcome({ to: "ada@4mica.io" }),
    ).rejects.toBeInstanceOf(EmailClientError);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("exposes one convenience method per template, all hitting the right path", async () => {
    post.mockResolvedValue({ data: { id: "msg" } });
    const client = new EmailClient("http://email:4100");

    for (const id of templateIds) {
      post.mockClear();
      await client.send(id, { to: "ada@4mica.io" } as never);
      expect(post).toHaveBeenCalledWith(templatePath(id), {
        to: "ada@4mica.io",
      });
    }
  });
});

describe("template contract", () => {
  it("keeps templateIds in sync with templateSchemas", () => {
    expect(templateIds.sort()).toEqual(Object.keys(templateSchemas).sort());
  });

  it("builds a kebab-case route per template", () => {
    for (const id of templateIds) {
      expect(templatePath(id)).toBe(`/emails/${id}`);
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});
