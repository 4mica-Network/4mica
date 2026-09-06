import { config } from "@config/index";
import { getProfile } from "@controllers/me/repository";
import { parseBody, requireUserId } from "@controllers/shared";
import { appLogger } from "@logger/index";
import type { RouteHandler } from "fastify";
import {
  consumeEmailVerification,
  createEmailVerification,
  EMAIL_VERIFICATION_TTL_HOURS,
  type VerificationResult,
} from "./repository";
import { VerifyEmailQuerySchema } from "./schema";

const verifyUrlFor = (token: string): string =>
  `${config.publicApiUrl}/verify-email?token=${encodeURIComponent(token)}`;

const outcomeUrl = (result: VerificationResult): string =>
  `${config.appUrl}/settings/profile?verify=${result}`;

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

  if (!user.email) {
    return reply.code(409).send({
      error: "email_missing",
      message: "Add an email address to your account before verifying it.",
    });
  }

  if (user.emailVerified) {
    return reply.code(409).send({
      error: "already_verified",
      message: "That email address is already verified.",
    });
  }

  const email = request.server.email;

  if (!email) {
    return reply.code(503).send({
      error: "email_unavailable",
      message: "Email sending is not configured. Try again later.",
    });
  }

  const token = await createEmailVerification(userId, user.email);
  const verifyUrl = verifyUrlFor(token);

  if (config.isDev) {
    appLogger.info("Email verification link", { userId, verifyUrl });
  }

  const sent = await email.sendAccountVerification({
    to: user.email,
    userName: user.name || undefined,
    verifyUrl,
    expiresInHours: EMAIL_VERIFICATION_TTL_HOURS,
  });

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

  const result = await consumeEmailVerification(parsed.data.token);

  return reply.redirect(outcomeUrl(result), 303);
};
