/**
 * Run a single transaction cycle for testing/demo.
 * Usage: node dist/run-once.js
 */

import dotenv from "dotenv";
import axios from "axios";
import { loadAgents } from "./agents.js";
import { Scheduler, TxResult } from "./scheduler.js";
import { startServiceRunner, stopServiceRunners } from "./service-runner.js";

dotenv.config();

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3402";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

const AGENT_PORTS: Record<string, number> = {
  Atlas: 4001,
  Sage: 4002,
  Pixel: 4003,
  Quant: 4004,
};

async function main(): Promise<void> {
  console.log("=== Stellar Agent Mesh — Single Transaction Test ===\n");

  // Load agents with real Stellar keypairs
  const agents = await loadAgents();
  console.log(`Loaded ${agents.length} agents with Stellar testnet accounts\n`);

  // Start service runners
  const runners = agents.map((agent) =>
    startServiceRunner(agent, AGENT_PORTS[agent.name] ?? 4099, OPENROUTER_API_KEY)
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Register agents
  for (const agent of agents) {
    for (const service of agent.services) {
      try {
        await axios.post(`${GATEWAY_URL}/register`, {
          id: service.id,
          seller: agent.pubkey,
          price: service.price,
          capability: service.capability,
          endpoint: service.endpoint,
        });
        console.log(`✅ Registered ${agent.name}/${service.capability}`);
      } catch (err: unknown) {
        console.error(`❌ Failed: ${agent.name}/${service.capability}`);
      }
    }
  }

  // Set spending policies
  for (const agent of agents) {
    try {
      await axios.post(`${GATEWAY_URL}/policy`, {
        agent: agent.pubkey,
        perTxLimit: 500,
        dailyLimit: 5000,
      });
    } catch {}
  }

  console.log("\n--- Running transactions ---\n");

  const results: TxResult[] = [];
  const scheduler = new Scheduler(GATEWAY_URL, agents, (r) => results.push(r));

  // Run one of each type
  const buyer = agents[0]; // Atlas
  const targetService = agents[1].services[0]; // Sage's code-review

  // Normal transaction
  console.log(`[1] ${buyer.name} → ${targetService.id} (normal)`);
  const r1 = await scheduler.executeTransaction(buyer, targetService.id, targetService.price, "test_normal");
  console.log(`    ${r1.success ? "✅" : "❌"} ${r1.latencyMs}ms | $${r1.amount}\n`);

  // High-value rejection
  console.log(`[2] ${buyer.name} → ${targetService.id} ($10K rejection test)`);
  const r2 = await scheduler.executeTransaction(buyer, targetService.id, 10000, "test_rejection");
  console.log(`    ${r2.success ? "✅" : "❌"} ${r2.latencyMs}ms | $${r2.amount} | ${r2.error || "ok"}\n`);

  // Cross-agent: Quant buys from Pixel
  const quant = agents[3];
  const pixelService = agents[2].services[1]; // Pixel's style-transfer
  console.log(`[3] ${quant.name} → ${pixelService.id} (cross-agent)`);
  const r3 = await scheduler.executeTransaction(quant, pixelService.id, pixelService.price, "test_cross");
  console.log(`    ${r3.success ? "✅" : "❌"} ${r3.latencyMs}ms | $${r3.amount}\n`);

  // Summary
  console.log("=== Summary ===");
  console.log(`Transactions: 3`);
  console.log(`Successful: ${[r1, r2, r3].filter((r) => r.success).length}`);
  console.log(`Failed: ${[r1, r2, r3].filter((r) => !r.success).length}`);

  // Check reputation
  try {
    const rep = await axios.get(`${GATEWAY_URL}/reputation/${buyer.pubkey}`);
    console.log(`\n${buyer.name} reputation:`, rep.data);
  } catch {}

  // Cleanup
  stopServiceRunners(runners);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
