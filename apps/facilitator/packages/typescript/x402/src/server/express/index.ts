import {
  type FacilitatorClient,
  type HTTPRequestContext,
  type PaywallConfig,
  type PaywallProvider,
  type RoutesConfig,
  x402HTTPResourceServer,
  x402ResourceServer,
} from '@x402/core/server'
import type { Network, SchemeNetworkServer } from '@x402/core/types'
import type { NextFunction, Request, Response } from 'express'
import { FourMicaFacilitatorClient } from '../facilitator.js'
import { FourMicaEvmScheme, SUPPORTED_NETWORKS } from '../scheme.js'
import { ExpressAdapter } from './adapter.js'

interface ResourceServerInternals {
  register: (network: Network, server: SchemeNetworkServer) => unknown
  hasExtension: (extension: string) => boolean
  registerExtension: (extension: unknown) => unknown
}

interface HTTPServerInternals {
  ResourceServer: ResourceServerInternals
  routesConfig: RoutesConfig
}

function getHTTPServerInternals(httpServer: x402HTTPResourceServer): HTTPServerInternals {
  return httpServer as unknown as HTTPServerInternals
}

function registerNetworkServers(httpServer: x402HTTPResourceServer) {
  const schemeServer = new FourMicaEvmScheme()
  const server = getHTTPServerInternals(httpServer)
  SUPPORTED_NETWORKS.forEach((network) => {
    server.ResourceServer.register(network, schemeServer)
  })
}

function checkIfBazaarNeeded(routes: RoutesConfig): boolean {
  if ('accepts' in routes) {
    return !!(routes.extensions && 'bazaar' in routes.extensions)
  }

  return Object.values(routes).some((routeConfig) => {
    return !!(routeConfig.extensions && 'bazaar' in routeConfig.extensions)
  })
}

/**
 * Configuration for registering a payment scheme with a specific network
 */
export interface SchemeRegistration {
  /**
   * The network identifier (e.g., 'eip155:84532', 'solana:mainnet')
   */
  network: Network

  /**
   * The scheme server implementation for this network
   */
  server: SchemeNetworkServer
}

/**
 * Express payment middleware for x402 protocol (direct HTTP server instance).
 *
 * Use this when you need to configure HTTP-level hooks.
 *
 * @param httpServer - Pre-configured x402HTTPResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddlewareFromHTTPServer, x402ResourceServer, x402HTTPResourceServer } from "@x402/express";
 *
 * const resourceServer = new x402ResourceServer(facilitatorClient)
 *   .register(NETWORK, new ExactEvmScheme())
 *
 * const httpServer = new x402HTTPResourceServer(resourceServer, routes)
 *   .onProtectedRequest(requestHook);
 *
 * app.use(paymentMiddlewareFromHTTPServer(httpServer));
 * ```
 */
export function paymentMiddlewareFromHTTPServer(
  httpServer: x402HTTPResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true
) {
  registerNetworkServers(httpServer)

  // Register custom paywall provider if provided
  if (paywall) {
    httpServer.registerPaywallProvider(paywall)
  }

  // Store initialization promise (not the result)
  // httpServer.initialize() fetches facilitator support and validates routes
  let initPromise: Promise<void> | null = syncFacilitatorOnStart ? httpServer.initialize() : null

  // Dynamically register bazaar extension if routes declare it and not already registered
  // Skip if pre-registered (e.g., in serverless environments where static imports are used)
  let bazaarPromise: Promise<void> | null = null
  const httpServerInternals = getHTTPServerInternals(httpServer)
  if (
    checkIfBazaarNeeded(httpServerInternals.routesConfig) &&
    !httpServerInternals.ResourceServer.hasExtension('bazaar')
  ) {
    bazaarPromise = import('@x402/extensions/bazaar')
      .then(({ bazaarResourceServerExtension }) => {
        httpServerInternals.ResourceServer.registerExtension(bazaarResourceServerExtension)
      })
      .catch((err) => {
        console.error('Failed to load bazaar extension:', err)
      })
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Create adapter and context
    const adapter = new ExpressAdapter(req)
    const context: HTTPRequestContext = {
      adapter,
      path: req.path,
      method: req.method,
      paymentHeader: adapter.getHeader('payment-signature') || adapter.getHeader('x-payment'),
    }

    // Check if route requires payment before initializing facilitator
    if (!httpServer.requiresPayment(context)) {
      return next()
    }

    // Only initialize when processing a protected route
    if (initPromise) {
      await initPromise
      initPromise = null // Clear after first await
    }

    // Await bazaar extension loading if needed
    if (bazaarPromise) {
      await bazaarPromise
      bazaarPromise = null
    }

    // Process payment requirement check
    const result = await httpServer.processHTTPRequest(context, paywallConfig)

    // Handle the different result types
    switch (result.type) {
      case 'no-payment-required':
        // No payment needed, proceed directly to the route handler
        return next()

      case 'payment-error': {
        // Payment required but not provided or invalid
        const { response } = result
        res.status(response.status)
        Object.entries(response.headers).forEach(([key, value]) => {
          res.setHeader(key, value)
        })
        if (response.isHtml) {
          res.send(response.body)
        } else {
          res.json(response.body || {})
        }
        return
      }

      case 'payment-verified': {
        // Payment is valid, need to wrap response for settlement
        const { paymentPayload, paymentRequirements } = result

        // Intercept and buffer all core methods that can commit response to client
        const originalWriteHead = res.writeHead.bind(res)
        const originalWrite = res.write.bind(res)
        const originalEnd = res.end.bind(res)
        const originalFlushHeaders = res.flushHeaders.bind(res)

        type BufferedCall =
          | ['writeHead', Parameters<typeof originalWriteHead>]
          | ['write', Parameters<typeof originalWrite>]
          | ['end', Parameters<typeof originalEnd>]
          | ['flushHeaders', []]
        let bufferedCalls: BufferedCall[] = []
        let settled = false

        // Create a promise that resolves when the handler finishes and calls res.end()
        let endCalled: () => void
        const endPromise = new Promise<void>((resolve) => {
          endCalled = resolve
        })

        res.writeHead = ((...args: Parameters<typeof originalWriteHead>) => {
          if (!settled) {
            bufferedCalls.push(['writeHead', args])
            return res
          }
          return originalWriteHead(...args)
        }) as typeof originalWriteHead

        res.write = ((...args: Parameters<typeof originalWrite>) => {
          if (!settled) {
            bufferedCalls.push(['write', args])
            return true
          }
          return originalWrite(...args)
        }) as typeof originalWrite

        res.end = ((...args: Parameters<typeof originalEnd>) => {
          if (!settled) {
            bufferedCalls.push(['end', args])
            // Signal that the handler has finished
            endCalled()
            return res
          }
          return originalEnd(...args)
        }) as typeof originalEnd

        res.flushHeaders = () => {
          if (!settled) {
            bufferedCalls.push(['flushHeaders', []])
            return
          }
          return originalFlushHeaders()
        }

        // Proceed to the next middleware or route handler
        next()

        // Wait for the handler to actually call res.end() before checking status
        await endPromise

        // If the response from the protected route is >= 400, do not settle payment
        if (res.statusCode >= 400) {
          settled = true
          res.writeHead = originalWriteHead
          res.write = originalWrite
          res.end = originalEnd
          res.flushHeaders = originalFlushHeaders
          // Replay all buffered calls in order
          for (const [method, args] of bufferedCalls) {
            if (method === 'writeHead')
              originalWriteHead(...(args as Parameters<typeof originalWriteHead>))
            else if (method === 'write')
              originalWrite(...(args as Parameters<typeof originalWrite>))
            else if (method === 'end') originalEnd(...(args as Parameters<typeof originalEnd>))
            else if (method === 'flushHeaders') originalFlushHeaders()
          }
          bufferedCalls = []
          return
        }

        try {
          const settleResult = await httpServer.processSettlement(
            paymentPayload,
            paymentRequirements
          )

          // If settlement fails, return an error and do not send the buffered response
          if (!settleResult.success) {
            bufferedCalls = []
            res.status(402).json({
              error: 'Settlement failed',
              details: settleResult.errorReason,
            })
            return
          }

          // Settlement succeeded - add headers to response
          Object.entries(settleResult.headers).forEach(([key, value]) => {
            res.setHeader(key, value)
          })
        } catch (error) {
          console.error(error)
          // If settlement fails, don't send the buffered response
          bufferedCalls = []
          res.status(402).json({
            error: 'Settlement failed',
            details: error instanceof Error ? error.message : 'Unknown error',
          })
          return
        } finally {
          settled = true
          res.writeHead = originalWriteHead
          res.write = originalWrite
          res.end = originalEnd
          res.flushHeaders = originalFlushHeaders

          // Replay all buffered calls in order
          for (const [method, args] of bufferedCalls) {
            if (method === 'writeHead')
              originalWriteHead(...(args as Parameters<typeof originalWriteHead>))
            else if (method === 'write')
              originalWrite(...(args as Parameters<typeof originalWrite>))
            else if (method === 'end') originalEnd(...(args as Parameters<typeof originalEnd>))
            else if (method === 'flushHeaders') originalFlushHeaders()
          }
          bufferedCalls = []
        }
        return
      }
    }
  }
}

/**
 * Express payment middleware for x402 protocol (direct server instance).
 *
 * Use this when you want to pass a pre-configured x402ResourceServer instance.
 * This provides more flexibility for testing, custom configuration, and reusing
 * server instances across multiple middlewares.
 *
 * @param routes - Route configurations for protected endpoints
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddleware } from "@x402/express";
 *
 * const server = new x402ResourceServer(myFacilitatorClient)
 *   .register(NETWORK, new ExactEvmScheme());
 *
 * app.use(paymentMiddleware(routes, server));
 * ```
 */
export function paymentMiddleware(
  routes: RoutesConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true
) {
  // Create the x402 HTTP server instance with the resource server
  const httpServer = new x402HTTPResourceServer(server, routes)

  return paymentMiddlewareFromHTTPServer(httpServer, paywallConfig, paywall, syncFacilitatorOnStart)
}

/**
 * Express payment middleware for x402 protocol (configuration-based).
 *
 * Use this when you want to quickly set up middleware with simple configuration.
 * This function creates and configures the x402ResourceServer internally.
 *
 * @param routes - Route configurations for protected endpoints
 * @param facilitatorClients - Optional facilitator client(s) for payment processing
 * @param schemes - Optional array of scheme registrations for server-side payment processing
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddlewareFromConfig } from "@x402/express";
 *
 * app.use(paymentMiddlewareFromConfig(routes));
 * ```
 */
export function paymentMiddlewareFromConfig(
  routes: RoutesConfig,
  facilitatorClients?: FacilitatorClient | FacilitatorClient[],
  schemes?: SchemeRegistration[],
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true
) {
  const facilitators = facilitatorClients
    ? Array.isArray(facilitatorClients)
      ? facilitatorClients
      : [facilitatorClients]
    : []

  if (!facilitators.some((c) => c instanceof FourMicaFacilitatorClient)) {
    facilitators.push(new FourMicaFacilitatorClient())
  }

  const ResourceServer = new x402ResourceServer(facilitators)

  if (schemes) {
    schemes.forEach(({ network, server: schemeServer }) => {
      ResourceServer.register(network, schemeServer)
    })
  }

  // Use the direct paymentMiddleware with the configured server
  // Note: paymentMiddleware handles dynamic bazaar registration
  return paymentMiddleware(routes, ResourceServer, paywallConfig, paywall, syncFacilitatorOnStart)
}

export { ExpressAdapter } from './adapter.js'
