import { beforeEach, describe, expect, it, vi } from "vitest";

const { send, ResendMock } = vi.hoisted(() => {
  const sendMock = vi.fn();

  return {
    send: sendMock,
    ResendMock: vi.fn(function ResendStub(this: { emails: unknown }) {
      this.emails = { send: sendMock };
    }),
  };
});

vi.mock("resend", () => ({ Resend: ResendMock }));

const dryRunConfig = {
  isTest: true,
  isDev: false,
  isProd: false,
  env: { LOG_DIR: "logs", LOG_LEVEL: "error" },
  email: {
    dryRun: true,
    apiKey: "",
    from: "4Mica <no-reply@4mica.io>",
    replyTo: "support@4mica.io",
  },
};

const { configMock } = vi.hoisted(() => ({
  configMock: { current: {} as Record<string, unknown> },
}));

vi.mock("@config/index", () => ({
  get config() {
    return configMock.current;
  },
}));

const WELCOME = {
  to: "ada@4mica.io",
  userName: "Ada",
} as const;

const importSubject = async () => {
  const module = await import("./resend");
  module.resetResendClient();

  return module;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  configMock.current = structuredClone(dryRunConfig);
});

describe("sendTemplate", () => {
  it("renders and logs without touching Resend when dry-running", async () => {
    const { sendTemplate } = await importSubject();

    const result = await sendTemplate("welcome", WELCOME);

    expect(result.dryRun).toBe(true);
    expect(result.templateId).toBe("welcome");
    expect(result.id).toMatch(/^dry-run_welcome_/);
    expect(send).not.toHaveBeenCalled();
    expect(ResendMock).not.toHaveBeenCalled();
  });

  it("sends html, text and the envelope Resend expects", async () => {
    configMock.current.email = {
      ...dryRunConfig.email,
      dryRun: false,
      apiKey: "re_test",
    };
    send.mockResolvedValue({ data: { id: "msg_live" }, error: null });
    const { sendTemplate } = await importSubject();

    const result = await sendTemplate("welcome", WELCOME);

    expect(result).toEqual({
      id: "msg_live",
      templateId: "welcome",
      dryRun: false,
    });

    const [message, options] = send.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(message.from).toBe("4Mica <no-reply@4mica.io>");
    expect(message.to).toEqual(["ada@4mica.io"]);
    expect(message.replyTo).toBe("support@4mica.io");
    expect(message.subject).toBe("Welcome to 4Mica");
    expect(String(message.html)).toContain("<html");
    expect(String(message.text).length).toBeGreaterThan(0);
    expect(options).toEqual({});
  });

  it("applies a template's reply-to override", async () => {
    configMock.current.email = {
      ...dryRunConfig.email,
      dryRun: false,
      apiKey: "re_test",
    };
    send.mockResolvedValue({ data: { id: "msg_receipt" }, error: null });
    const { sendTemplate } = await importSubject();

    await sendTemplate("receipt", {
      to: "ada@4mica.io",
      userName: "Ada",
      orderNumber: "4M-1",
      purchaseDate: "2026-08-03T09:12:00.000Z",
      total: { amount: 100, currency: "USD" },
      items: [
        { name: "Plan", quantity: 1, price: { amount: 100, currency: "USD" } },
      ],
    });

    const [message] = send.mock.calls[0] as [Record<string, unknown>];
    expect(message.replyTo).toBe("billing@4mica.io");
  });

  it("forwards an idempotency key so a retry cannot double-send", async () => {
    configMock.current.email = {
      ...dryRunConfig.email,
      dryRun: false,
      apiKey: "re_test",
    };
    send.mockResolvedValue({ data: { id: "msg_idem" }, error: null });
    const { sendTemplate } = await importSubject();

    await sendTemplate("welcome", {
      ...WELCOME,
      idempotencyKey: "user-1-welcome",
    });

    expect(send.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: "user-1-welcome",
    });
  });

  it("throws EmailSendError when Resend returns an error", async () => {
    configMock.current.email = {
      ...dryRunConfig.email,
      dryRun: false,
      apiKey: "re_test",
    };
    send.mockResolvedValue({
      data: null,
      error: { message: "Domain is not verified", name: "validation_error" },
    });
    const { EmailSendError, sendTemplate } = await importSubject();

    const error = await sendTemplate("welcome", WELCOME).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as Error).message).toBe("Domain is not verified");
  });

  it("throws EmailSendError when the SDK itself throws", async () => {
    configMock.current.email = {
      ...dryRunConfig.email,
      dryRun: false,
      apiKey: "re_test",
    };
    send.mockRejectedValue(new Error("socket hang up"));
    const { EmailSendError, sendTemplate } = await importSubject();

    await expect(sendTemplate("welcome", WELCOME)).rejects.toBeInstanceOf(
      EmailSendError,
    );
  });

  it("throws when Resend accepts the message but returns no id", async () => {
    configMock.current.email = {
      ...dryRunConfig.email,
      dryRun: false,
      apiKey: "re_test",
    };
    send.mockResolvedValue({ data: null, error: null });
    const { EmailSendError, sendTemplate } = await importSubject();

    await expect(sendTemplate("welcome", WELCOME)).rejects.toBeInstanceOf(
      EmailSendError,
    );
  });
});
