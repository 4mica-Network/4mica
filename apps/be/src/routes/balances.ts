import { listBalancesHandler } from "@controllers/balances/index";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  balancesResponseSchema,
  errorResponseSchema,
  limitedResponses,
} from "./schema-fragments";

export const balanceRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    "/me/balances",
    {
      ...guards(app),
      schema: {
        tags: ["balances"],
        summary: "Live 4mica collateral for each of this account's wallets",
        description:
          "Read from 4mica core for every ACTIVE wallet on core's chain and every asset core accepts, the native asset first. Amounts are base-unit integer strings; `available` is `total - locked`. A 503 means core is unconfigured or unreachable.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: balancesResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listBalancesHandler,
  );

  done();
};
