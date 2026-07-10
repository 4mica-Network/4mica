export type BuildType = "agent" | "seller" | "buyer";

/** For agents this is the trading role; for seller/buyer it is the web framework. */
export type Framework = "express" | "hono" | "next";
export type AgentRole = "seller" | "buyer";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface InitOptions {
  /** Absolute or relative target directory for the new project. */
  dir: string;
  /** npm-safe project name (also the package.json "name"). */
  name: string;
  type: BuildType;
  /** Framework for seller/buyer; ignored for agent (role drives that). */
  framework: Framework;
  /** Trading role when type === "agent". */
  agentRole: AgentRole;
  packageManager: PackageManager;
  install: boolean;
  run: boolean;
  openDashboard: boolean;
}

export interface TemplateMeta {
  /** Directory name under packages/cli/templates. */
  dir: string;
  /** Default listening port (sellers/agents) or target port (buyers). */
  port: number;
  /** os.tmpdir() handshake filename, so a scaffolded pair interoperate. */
  tmpfile: string;
  /** package.json script to launch after scaffolding. */
  runScript: "dev" | "start";
  /** Human description injected into package.json + README. */
  description: string;
}
