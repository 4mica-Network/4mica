import { invalidateUser } from "@auth/user-store";
import { config } from "@config/index";
import { getProfile } from "@controllers/me/repository";
import { invalidBody, parseBody, requireUserId } from "@controllers/shared";
import { appLogger } from "@logger/index";
import type { FastifyInstance, RouteHandler } from "fastify";
import {
  consumeEmailVerification,
  createEmailVerification,
  EMAIL_VERIFICATION_TTL_HOURS,
  type VerificationResult,
} from "./repository";
import { ConfirmEmailBodySchema, VerifyEmailQuerySchema } from "./schema";

const verifyUrlFor = (token: string): string =>
  `${config.publicApiUrl}/verify-email?token=${encodeURIComponent(token)}`;

const outcomeUrl = (result: VerificationResult): string =>
  `${config.appUrl}/settings/profile?verify=${result}`;

const confirmUrl = (token: string): string =>
  `${config.appUrl}/settings/profile?verifyToken=${encodeURIComponent(token)}`;

type EmailClient = NonNullable<FastifyInstance["email"]>;

export const deliverVerification = async (
  email: EmailClient,
  userId: string,
  target: string,
  name: string,
): Promise<boolean> => {
  const token = await createEmailVerification(userId, target);
  const verifyUrl = verifyUrlFor(token);

  if (config.isDev) {
    appLogger.info("Email verification link", { userId, verifyUrl });
  }

  const sent = await email.sendAccountVerification({
    to: target,
    userName: name || undefined,
    verifyUrl,
    expiresInHours: EMAIL_VERIFICATION_TTL_HOURS,
  });

  return Boolean(sent);
};

export const sendVerificationEmailHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const user = await getProfile(userId);

  if (!user) {
    return reply.code(401).send({
      error: "unauthorized",
      message: "The authenticated user no longer exists.",
    });
  }

  const target = user.pendingEmail ?? (user.emailVerified ? null : user.email);

  if (!target) {
    return user.email
      ? reply.code(409).send({
          error: "already_verified",
          message: "That email address is already verified.",
        })
      : reply.code(409).send({
          error: "email_missing",
          message: "Add an email address to your account before verifying it.",
        });
  }

  const email = request.server.email;

  if (!email) {
    return reply.code(503).send({
      error: "email_unavailable",
      message: "Email sending is not configured. Try again later.",
    });
  }

  const sent = await deliverVerification(email, userId, target, user.name);

  if (!sent) {
    return reply.code(502).send({
      error: "email_send_failed",
      message: "We couldn't send the verification email. Try again shortly.",
    });
  }

  return reply.code(202).send({ sent: true });
};

export const verifyEmailHandler: RouteHandler = async (request, reply) => {
  const parsed = parseBody(VerifyEmailQuerySchema, request.query);
  if (!parsed.success) {
    return reply.redirect(outcomeUrl("invalid"), 303);
  }

  return reply.redirect(confirmUrl(parsed.data.token), 303);
};

const CONFIRM_FAILURES = {
  invalid: {
    code: 400,
    error: "invalid_token",
    message:
      "That link didn't work. It may have been used already, belong to another account, or be for an address you have since changed.",
  },
  expired: {
    code: 410,
    error: "token_expired",
    message: "That link expired. Send yourself a fresh one.",
  },
  taken: {
    code: 409,
    error: "email_taken",
    message: "Another account already uses that email address.",
  },
} as const;

export const confirmEmailHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(ConfirmEmailBodySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await consumeEmailVerification(parsed.data.token, userId);

  if (result !== "success") {
    const { code, error, message } = CONFIRM_FAILURES[result];
    return reply.code(code).send({ error, message });
  }

  if (request.user) {
    invalidateUser(request.user.clerkUserId);
  }

  appLogger.info("Email verified", { userId });
  return reply.send(await getProfile(userId));
};
