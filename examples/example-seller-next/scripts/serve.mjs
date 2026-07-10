import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const PORT_FILE = join(tmpdir(), "4mica-example-next.url");
const mode = process.argv[2] === "start" ? "start" : "dev";

function findPort(port, attemptsLeft = 20) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (err) => {
      if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
        resolve(findPort(port + 1, attemptsLeft - 1));
      } else {
        reject(err);
      }
    });
    probe.once("listening", () => probe.close(() => resolve(port)));
    probe.listen(port, "0.0.0.0");
  });
}

const base = Number(process.env.PORT) || 3002;
const port = await findPort(base);
const url = `http://localhost:${port}`;
writeFileSync(PORT_FILE, url);
if (port !== base) {
  console.log(`[seller-next] port ${base} in use, using ${port}`);
}

const child = spawn(process.execPath, [nextBin, mode, "-p", String(port)], {
  stdio: "inherit",
  env: { ...process.env, EXAMPLE_BASE_URL: url },
});

const cleanup = () => rmSync(PORT_FILE, { force: true });
process.on("exit", cleanup);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
