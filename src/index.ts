import dotenv from "dotenv";
import axios from "axios";
import { loadAgents, Agent } from "./agents.js";
import { Scheduler } from "./scheduler.js";
import { StatsCollector } from "./stats.js";
import { startServiceRunner, stopServiceRunners } from "./service-runner.js";

dotenv.config();

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3402";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const STATS_PATH = "./stats.json";

// Each agent gets its own port for service endpoints
const AGENT_PORTS: Record<string, number> = {
  Atlas: 4001,
  Sage: 4002,
  Pixel: 4003,
  Quant: 4004,
};

async function registerAgents(gatewayUrl: string, agents: Agent[]): Promise<void> {
  for (const agent of agents) {
    for (const service of agent.services) {
      try {
        await axios.post(`${gatewayUrl}/register`, {
          id: service.id,
          seller: agent.pubkey,
          price: service.price,
          capability: service.capability,
          endpoint: service.endpoint,
        });
        console.log(
          `[${new Date().toISOString()}] Registered ${agent.name}/${service.id}`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(
          `[${new Date().toISOString()}] Failed to register ${agent.name}/${service.id}: ${msg}`
        );
      }
    }
  }
}

async function registerFederationNames(gatewayUrl: string, agents: Agent[]): Promise<void> {
  for (const agent of agents) {
    try {
      await axios.post(`${gatewayUrl}/federation/register`, {
        name: agent.name.toLowerCase(),
        address: agent.pubkey,
      });
      console.log(
        `[${new Date().toISOString()}] Federation: ${agent.name.toLowerCase()}*mesh.agent → ${agent.pubkey.slice(0, 12)}...`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[${new Date().toISOString()}] Failed to register federation for ${agent.name}: ${msg}`
      );
    }
  }
}

async function setSpendingPolicies(gatewayUrl: string, agents: Agent[]): Promise<void> {
  for (const agent of agents) {
    try {
      await axios.post(`${gatewayUrl}/policy`, {
        agent: agent.pubkey,
        perTxLimit: 500,
        dailyLimit: 5000,
      });
      console.log(
        `[${new Date().toISOString()}] Policy set for ${agent.name} (perTx: 500, daily: 5000)`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[${new Date().toISOString()}] Failed to set policy for ${agent.name}: ${msg}`
      );
    }
  }
}

async function main(): Promise<void> {
  // Load or create agents with real Stellar testnet keypairs
  console.log(`[${new Date().toISOString()}] Loading agents...`);
  const agents = await loadAgents();
  console.log(`[${new Date().toISOString()}] ${agents.length} agents ready with Stellar testnet accounts`);

  const stats = new StatsCollector();
  const scheduler = new Scheduler(GATEWAY_URL, agents, (result) =>
    stats.record(result)
  );

  // Start service runners (Nemo-powered endpoints for each agent)
  const runners = agents.map((agent) =>
    startServiceRunner(agent, AGENT_PORTS[agent.name] ?? 4099, OPENROUTER_API_KEY)
  );

  // Give runners a moment to bind ports
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Register all agents and their services on the gateway
  await registerAgents(GATEWAY_URL, agents);

  // Register federation names (atlas*mesh.agent, sage*mesh.agent, etc.)
  await registerFederationNames(GATEWAY_URL, agents);

  // Set spending policies
  await setSpendingPolicies(GATEWAY_URL, agents);

  // Start the scheduler
  scheduler.start();

  // Start hourly stats writing
  stats.startHourlyWrite(STATS_PATH);

  const totalServices = agents.reduce(
    (sum, a) => sum + a.services.length,
    0
  );
  console.log(
    `[${new Date().toISOString()}] Stellar Agent Mesh Battle Harness running | ${agents.length} agents | ${totalServices} services | gateway: ${GATEWAY_URL}`
  );

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n[${new Date().toISOString()}] Shutting down...`);
    scheduler.stop();
    stopServiceRunners(runners);
    stats.stopHourlyWrite();
    stats.writeStats(STATS_PATH);
    console.log(`[${new Date().toISOString()}] Final stats written. Goodbye.`);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
