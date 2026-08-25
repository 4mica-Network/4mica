import { config } from "@config/index";
import {
  addColors,
  createLogger,
  format,
  type Logger,
  transports,
} from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4 } as const;

addColors({
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "blue",
});

const { colorize, combine, errors, json, printf, splat, timestamp } = format;

const consoleFormat = combine(
  errors({ stack: true }),
  splat(),
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

const fileFormat = combine(
  errors({ stack: true }),
  splat(),
  timestamp(),
  json(),
);

const rotatingFile = (filename: string, level?: string) =>
  new DailyRotateFile({
    dirname: config.env.LOG_DIR,
    filename,
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "14d",
    level,
    format: fileFormat,
  });

const buildTransports = () =>
  config.isTest
    ? [new transports.Console({ format: consoleFormat, silent: true })]
    : [
        new transports.Console({ format: consoleFormat }),
        rotatingFile("app-%DATE%.log"),
        rotatingFile("error-%DATE%.log", "error"),
      ];

const created: Logger[] = [];

export const createScopedLogger = (label: string): Logger => {
  const logger = createLogger({
    levels: LEVELS,
    level: config.env.LOG_LEVEL,
    defaultMeta: { label, service: "@4mica/be" },
    transports: buildTransports(),
    exitOnError: false,
  });

  created.push(logger);

  return logger;
};

export const appLogger = createScopedLogger("app");
export const httpLogger = createScopedLogger("http");

export const closeLoggers = async (): Promise<void> => {
  if (config.isTest) {
    return;
  }

  await Promise.all(
    created.map(
      (logger) =>
        new Promise<void>((resolve) => {
          logger.once("finish", () => {
            resolve();
          });
          logger.end();
        }),
    ),
  );
};
