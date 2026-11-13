import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createPayments } from "./payments.js";
import { proxyClient } from "./proxy.js";
import { createServer } from "./server.js";

const config = loadConfig();
const server = createServer(
  await createPayments(config),
  proxyClient(config.PROXY_URL, config.PROXY_TOKEN),
);

const app = createMcpExpressApp({ host: config.HOST });
// Stateless Streamable HTTP: a fresh server and transport per request, so any instance serves any call.
app.post("/mcp", async (req, res) => {
  const mcp = server();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    mcp.close();
  });
  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.listen(config.PORT, config.HOST, () => {
  console.log(
    `Firecrawl seller on http://${config.HOST}:${config.PORT}/mcp, paid to ${config.signer.address}`,
  );
});
