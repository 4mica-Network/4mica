import type {
  AgentProfile,
  Mode,
  NewAgentInput,
  Transaction,
  WhitelistEntry,
} from "./types";

/**
 * The single interface both the sandbox (mock) and live (hosted API) clients
 * implement. Pages are written against this async surface, so switching modes
 * requires no page changes — the Stripe test-mode → live pattern.
 */
export interface DashboardClient {
  readonly mode: Mode;

  listAgents(): Promise<AgentProfile[]>;
  getAgent(id: string): Promise<AgentProfile | undefined>;
  addAgent(input: NewAgentInput): Promise<AgentProfile>;
  removeAgent(id: string): Promise<void>;
  publishAgent(id: string, published: boolean): Promise<AgentProfile>;

  listTransactions(): Promise<Transaction[]>;

  listWhitelist(): Promise<WhitelistEntry[]>;
  setWhitelisted(agentId: string, allowed: boolean): Promise<void>;
}
