import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express, { type Request, type Response } from 'express'
import { z } from 'zod'
import { fakeDataset, simulateRun } from './apify/dataset.js'
import {
  errorToolResult,
  paidToolResult,
  paymentRequiredToolResult,
  type ResourceInfo,
  readPaymentPayload,
  toolPaymentMeta,
} from './apify/payments.js'
import { DemoSeller, type SellerEnv, sellerEnv } from './apify/seller.js'

/**
 * A Streamable HTTP MCP server with one paid tool, `run-actor`, shaped like a tool on
 * Apify's MCP server: `_meta.x402` on the tool advertises the accepts, an unpaid call
 * gets the challenge as an error result, and a paid call carries the payment in
 * `_meta["x402/payment"]` (or the `PAYMENT-SIGNATURE` header). The buyer is mcpc:
 * `mcpc connect http://localhost:3001/mcp @demo --x402 4mica-credit`.
 */
const PORT = Number(process.env.MCP_PORT || 3001)
const TOOL_NAME = 'run-actor'
const ACTOR_ID = 'demo~scraper'
const env = sellerEnv()

function createMcpServer(seller: DemoSeller, resource: ResourceInfo, env: SellerEnv): McpServer {
  const mcp = new McpServer({ name: '4mica-apify-demo', version: '0.0.1' })

  mcp.registerTool(
    TOOL_NAME,
    {
      title: 'Run Actor',
      description: `Runs the ${ACTOR_ID} Actor for a query and returns its dataset. Paid per run with x402.`,
      inputSchema: { query: z.string().describe('What the Actor should search for') },
      _meta: { x402: toolPaymentMeta(seller.accepts) },
    },
    async ({ query }, extra) => {
      let payload: ReturnType<typeof readPaymentPayload>
      try {
        payload = readPaymentPayload({
          meta: extra._meta as Record<string, unknown> | undefined,
          header: extra.requestInfo?.headers['payment-signature'],
        })
      } catch (error) {
        return errorToolResult(`Payment rejected: ${(error as Error).message}`)
      }

      if (!payload) {
        console.log(`${TOOL_NAME}: no payment, challenging with ${seller.accepts.length} accepts`)
        return paymentRequiredToolResult(seller.paymentRequired(resource))
      }

      const outcome = await seller.verify(payload)
      if (outcome.status === 'invalid') {
        console.log(`${TOOL_NAME}: payment rejected: ${outcome.reason}`)
        return errorToolResult(`Payment rejected: ${outcome.reason}`)
      }
      console.log(
        `verify ok: ${outcome.requirements.scheme} from ${outcome.payer ?? 'unknown payer'} for ${outcome.requirements.amount} on ${outcome.requirements.network}`
      )

      console.log(`running ${ACTOR_ID} for "${query}" (${env.runSeconds}s)...`)
      await simulateRun(env.runSeconds)
      const items = fakeDataset(query)

      try {
        const settlement = await seller.settle(payload, outcome.requirements)
        console.log(`settle ok: guarantee issued, payer ${settlement.payer ?? outcome.payer}`)
        return paidToolResult(items, settlement)
      } catch (error) {
        console.log(`${TOOL_NAME}: settlement failed: ${(error as Error).message}`)
        return errorToolResult(`Settlement failed: ${(error as Error).message}`)
      }
    }
  )

  return mcp
}

async function main() {
  const seller = await DemoSeller.create(env)
  const baseUrl = process.env.MCP_URL || `http://localhost:${PORT}`
  const resource: ResourceInfo = {
    url: `${baseUrl}/mcp`,
    description: `MCP tool ${TOOL_NAME}: run the ${ACTOR_ID} Actor`,
    mimeType: 'application/json',
  }

  // One transport and server per MCP session, keyed by the `mcp-session-id` header.
  const transports = new Map<string, StreamableHTTPServerTransport>()

  const app = express()
  app.use(express.json())

  app.post('/mcp', async (req, res) => {
    const existing = sessionTransport(req, transports)
    if (existing) {
      await existing.handleRequest(req, res, req.body)
      return
    }
    if (req.headers['mcp-session-id'] !== undefined) {
      unknownSession(res)
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport)
      },
      onsessionclosed: (sessionId) => {
        transports.delete(sessionId)
      },
    })
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId)
    }
    await createMcpServer(seller, resource, env).connect(transport)
    await transport.handleRequest(req, res, req.body)
  })

  const forward = async (req: Request, res: Response) => {
    const transport = sessionTransport(req, transports)
    if (!transport) {
      unknownSession(res)
      return
    }
    await transport.handleRequest(req, res)
  }
  app.get('/mcp', forward)
  app.delete('/mcp', forward)

  app.get('/', (_req, res) => {
    res.json({
      message: 'Apify-shaped x402 demo: MCP server',
      mcp: `${baseUrl}/mcp`,
      tool: TOOL_NAME,
      network: env.network,
      core: env.coreUrl ?? 'hosted',
      facilitator: env.facilitatorUrl ?? 'https://x402.4mica.xyz',
      price: env.price,
      accepts: seller.accepts.map((entry) => entry.scheme),
    })
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.listen(PORT, () => {
    console.log(`MCP server on ${baseUrl}/mcp`)
    console.log(`Paid tool: ${TOOL_NAME} (${ACTOR_ID})`)
    console.log(
      `Payment required: ${env.price} on ${env.network}; accepts ${seller.accepts.map((entry) => entry.scheme).join(', ')}`
    )
    console.log(`Buyer: mcpc connect ${baseUrl}/mcp @demo --x402 4mica-credit`)
  })
}

function sessionTransport(
  req: Request,
  transports: Map<string, StreamableHTTPServerTransport>
): StreamableHTTPServerTransport | undefined {
  const sessionId = req.headers['mcp-session-id']
  return typeof sessionId === 'string' ? transports.get(sessionId) : undefined
}

function unknownSession(res: Response) {
  res.status(404).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Session not found' },
    id: null,
  })
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
