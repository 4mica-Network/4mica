import { createHash } from "node:crypto";
import type { Plugin } from "vite";
import { type ServiceWorkerConfig, serviceWorker } from "./worker";

export const SERVICE_WORKER_FILE = "sw.js";

export const shellFiles = (html: string): string[] => [
  ...new Set([
    "/index.html",
    ...[...html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map(
      (match) => match[1],
    ),
  ]),
];

export const serviceWorkerSource = (config: ServiceWorkerConfig): string =>
  `(${serviceWorker.toString()})(${JSON.stringify(config)}, self);\n`;

export const serviceWorkerConfig = (html: string): ServiceWorkerConfig => {
  const shell = shellFiles(html);
  return {
    version: createHash("sha256").update(html).digest("hex").slice(0, 12),
    shell,
    fallback: "/index.html",
    runtimeLimit: 150,
  };
};

export function serviceWorkerPlugin(): Plugin {
  return {
    name: "4mica-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (page?.type !== "asset") {
        this.error("index.html is missing from the bundle");
      }
      this.emitFile({
        type: "asset",
        fileName: SERVICE_WORKER_FILE,
        source: serviceWorkerSource(serviceWorkerConfig(String(page.source))),
      });
    },
  };
}
