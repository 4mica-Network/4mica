import { prisma } from "@4mica/db";

export const countAgents = () => prisma.agent.count();
