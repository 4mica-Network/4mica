#!/usr/bin/env node

const { execSync } = require("node:child_process");
const net = require("node:net");

const startPort = parseInt(process.env.PORT || "3000", 10);

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function findAvailablePort(start) {
  let port = start;
  const maxAttempts = 10;

  for (let i = 0; i < maxAttempts; i++) {
    const available = await checkPort(port);
    if (available) {
      return port;
    }
    port++;
  }

  throw new Error(`Could not find an available port starting from ${start}`);
}

(async () => {
  try {
    const availablePort = await findAvailablePort(startPort);

    if (availablePort !== startPort) {
      console.log(
        `Port ${startPort} is in use. Using port ${availablePort} instead.`,
      );
    }

    const command = `cross-env NODE_ENV=development next dev -H 0.0.0.0 -p ${availablePort}`;
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    console.error("Failed to start dev server:", error.message);
    process.exit(1);
  }
})();
