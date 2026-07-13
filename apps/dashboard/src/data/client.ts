import type {
  AgentProfile,
  Mode,
  NewAgentInput,
  Transaction,
  WhitelistEntry,
} from "./types";

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
