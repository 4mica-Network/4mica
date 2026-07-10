import type { DashboardClient } from "./client";
import { seedAgents, seedTransactions, seedWhitelist } from "./fixtures";
import type {
  AgentProfile,
  NewAgentInput,
  Transaction,
  WhitelistEntry,
} from "./types";

const NATIVE = "0x0000000000000000000000000000000000000000";

// Module-level store so mutations persist across page navigations, exactly as
// a real backend would. Reset on full page reload (sandbox semantics).
let agents = seedAgents();
const transactions = seedTransactions();
let whitelist = seedWhitelist();
let counter = 100;

/** Small artificial latency so the UI exercises real loading states. */
function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

export function mockClient(): DashboardClient {
  return {
    mode: "sandbox",

    listAgents: () => delay(agents.map((a) => ({ ...a }))),

    getAgent: (id) => delay(agents.find((a) => a.id === id)),

    addAgent: (input: NewAgentInput) => {
      const now = new Date().toISOString();
      const agent: AgentProfile = {
        id: nextId("agt"),
        name: input.name,
        description: input.description,
        accuracy: 0,
        uptime: 100,
        pricing: {
          amount: input.amount,
          asset: NATIVE,
          network: "base-sepolia",
        },
        payTo: "0x0000000000000000000000000000000000000000",
        policy: { minValidationScore: input.minValidationScore },
        verification: "unverified",
        published: false,
        suspended: false,
        createdAt: now,
      };
      agents = [...agents, agent];
      whitelist = [
        ...whitelist,
        { agentId: agent.id, name: agent.name, allowed: false, addedAt: now },
      ];
      return delay(agent);
    },

    removeAgent: (id) => {
      agents = agents.filter((a) => a.id !== id);
      whitelist = whitelist.filter((w) => w.agentId !== id);
      return delay(undefined);
    },

    publishAgent: (id, published) => {
      agents = agents.map((a) => (a.id === id ? { ...a, published } : a));
      const agent = agents.find((a) => a.id === id);
      if (!agent) throw new Error(`Agent not found: ${id}`);
      return delay({ ...agent });
    },

    listTransactions: () =>
      delay(transactions.map((t: Transaction) => ({ ...t }))),

    listWhitelist: () =>
      delay(whitelist.map((w: WhitelistEntry) => ({ ...w }))),

    setWhitelisted: (agentId, allowed) => {
      whitelist = whitelist.map((w) =>
        w.agentId === agentId ? { ...w, allowed } : w,
      );
      agents = agents.map((a) =>
        a.id === agentId ? { ...a, suspended: !allowed } : a,
      );
      return delay(undefined);
    },
  };
}
