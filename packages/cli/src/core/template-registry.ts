import type { InitOptions, TemplateMeta } from "../types.js";

/**
 * Resolve the concrete template directory + metadata for a scaffold request.
 *
 * - agent  → seller-agent (Express) or buyer-agent (Node), by trading role
 * - seller → paywalled API by framework (express | hono | next)
 * - buyer  → x402 client targeting a seller of the chosen framework
 */
export function resolveTemplate(opts: InitOptions): TemplateMeta {
  if (opts.type === "agent") {
    // Fixed handshake file so a scaffolded seller-agent + buyer-agent pair
    // discover each other on the same machine without extra config.
    return opts.agentRole === "seller"
      ? {
          dir: "agent-seller-express",
          port: 4100,
          tmpfile: "4mica-agent.url",
          runScript: "dev",
          description:
            "Trading seller agent: sells information, paywalls the " +
            "premium result with dynamic per-request pricing",
        }
      : {
          dir: "agent-buyer-node",
          port: 4100,
          tmpfile: "4mica-agent.url",
          runScript: "start",
          description:
            "Trading buyer agent: pursues a goal under a budget, pays " +
            "sellers over x402, and adapts its strategy",
        };
  }

  const ports: Record<string, number> = {
    express: 3000,
    hono: 3001,
    next: 3002,
  };

  // seller and buyer of the same framework share a handshake file + port so a
  // scaffolded pair interoperate in demo mode out of the box.
  const tmpfile = `4mica-${opts.framework}.url`;

  if (opts.type === "seller") {
    return {
      dir: `seller-${opts.framework}`,
      port: ports[opts.framework],
      tmpfile,
      runScript: "dev",
      description: `Seller (recipient): gate a ${opts.framework} route behind a 4Mica x402 paywall`,
    };
  }

  return {
    dir: `buyer-${opts.framework}`,
    port: ports[opts.framework],
    tmpfile,
    runScript: "start",
    description: `Buyer (payer): perform the x402 handshake against a ${opts.framework} seller`,
  };
}
