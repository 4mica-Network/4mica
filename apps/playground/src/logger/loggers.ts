import "server-only";

import * as Sentry from "@sentry/nextjs";
import {
  addColors,
  createLogger,
  format,
  type Logger,
  transports,
} from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import Transport from "winston-transport";
import { serverEnv } from "@/env.server";
import { redactLogInfo } from "@/lib/telemetry";

/**
 * Ported from apps/be/src/logger/loggers.ts so both services produce the same
 * console and file shapes.
 *
 * Server only: this touches the filesystem, so it must never be imported from
 * src/middleware.ts (Edge runtime, no fs) or from a client component such as
 * app/global-error.tsx.
 */

const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4 } as const;

addColors({
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "blue",
});

const { colorize, combine, errors, json, printf, splat, timestamp } = format;

const redact = format((info) => redactLogInfo(info));

const scrubbed = () => combine(errors({ stack: true }), splat(), redact());

const SentryTransport = Sentry.createSentryWinstonTransport(Transport, {
  levels: ["error", "warn"],
});

const prettyFormat = combine(
  scrubbed(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  colorize({ level: true }),
  printf((info) => {
    const {
      level,
      message,
      timestamp: ts,
      label,
      stack,
      service,
      ...meta
    } = info;
    const scope = label ? ` [${String(label)}]` : "";
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";

    return `${String(ts)} ${level}${scope}: ${String(stack ?? message)}${extra}`;
  }),
);

export const jsonFormat = combine(scrubbed(), timestamp(), json());

const rotatingFile = (filename: string, level?: string) =>
  new DailyRotateFile({
    dirname: serverEnv().LOG_DIR,
    filename,
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "14d",
    level,
    format: jsonFormat,
  });

const buildTransports = () => {
  const { NODE_ENV } = serverEnv();

  if (NODE_ENV === "test") {
    return [new transports.Console({ format: prettyFormat, silent: true })];
  }

  return [
    new transports.Console({
      format: NODE_ENV === "production" ? jsonFormat : prettyFormat,
    }),
    rotatingFile("app-%DATE%.log"),
    rotatingFile("error-%DATE%.log", "error"),
    new SentryTransport({ format: scrubbed() }),
  ];
};

const createScopedLogger = (label: string): Logger =>
  createLogger({
    levels: LEVELS,
    level: serverEnv().LOG_LEVEL,
    defaultMeta: { label, service: "@4mica/playground" },
    transports: buildTransports(),
    exitOnError: false,
  });

export const appLogger = createScopedLogger("app");
