import * as StellarSdk from '@stellar/stellar-sdk';
import * as fs from 'fs';
import * as path from 'path';

export interface AgentService {
  id: string;
  capability: string;
  price: number;
  endpoint: string;
}

export interface Agent {
  name: string;
  pubkey: string;
  secret: string;
  services: AgentService[];
}

const AGENTS_FILE = path.join(process.cwd(), 'agents-keys.json');
const FRIENDBOT_URL = 'https://friendbot.stellar.org';

interface StoredAgent {
  name: string;
  pubkey: string;
  secret: string;
}

/**
 * Agent definitions — services each agent provides.
 */
const AGENT_DEFS = [
  {
    name: 'Atlas',
    port: 4001,
    services: [
      { id: 'atlas-web-search', capability: 'web-search', price: 0.50 },
      { id: 'atlas-news-aggregation', capability: 'news-aggregation', price: 1.25 },
    ],
  },
  {
    name: 'Sage',
    port: 4002,
    services: [
      { id: 'sage-code-review', capability: 'code-review', price: 1.75 },
      { id: 'sage-bug-analysis', capability: 'bug-analysis', price: 2.00 },
    ],
  },
  {
    name: 'Pixel',
    port: 4003,
    services: [
      { id: 'pixel-image-gen', capability: 'image-gen', price: 1.50 },
      { id: 'pixel-style-transfer', capability: 'style-transfer', price: 0.75 },
    ],
  },
  {
    name: 'Quant',
    port: 4004,
    services: [
      { id: 'quant-market-data', capability: 'market-data', price: 0.10 },
      { id: 'quant-risk-scoring', capability: 'risk-scoring', price: 1.00 },
    ],
  },
];

async function fundAccount(publicKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${FRIENDBOT_URL}?addr=${publicKey}`);
    if (!response.ok) {
      const text = await response.text();
      if (text.includes('createAccountAlreadyExist')) return true;
      console.error(`Friendbot error for ${publicKey}: ${text.slice(0, 200)}`);
      return false;
    }
    console.log(`  ✓ Funded ${publicKey.slice(0, 8)}... via Friendbot`);
    return true;
  } catch (err) {
    console.error(`Friendbot failed:`, err);
    return false;
  }
}

/**
 * Load or create agents with real Stellar testnet keypairs.
 * Persists keypairs to agents-keys.json so the same accounts are reused across restarts.
 */
export async function loadAgents(): Promise<Agent[]> {
  let stored: StoredAgent[] = [];

  // Load existing keypairs if available
  if (fs.existsSync(AGENTS_FILE)) {
    try {
      stored = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf-8'));
      console.log(`Loaded ${stored.length} agent keypairs from ${AGENTS_FILE}`);
    } catch {
      stored = [];
    }
  }

  const agents: Agent[] = [];

  for (const def of AGENT_DEFS) {
    let existing = stored.find(s => s.name === def.name);

    if (!existing) {
      // Generate new keypair
      const kp = StellarSdk.Keypair.random();
      existing = {
        name: def.name,
        pubkey: kp.publicKey(),
        secret: kp.secret(),
      };
      console.log(`Generated new keypair for ${def.name}: ${existing.pubkey.slice(0, 12)}...`);

      // Fund via Friendbot
      const funded = await fundAccount(existing.pubkey);
      if (!funded) {
        console.error(`WARNING: Could not fund ${def.name} — transactions will fail`);
      }
    }

    agents.push({
      name: existing.name,
      pubkey: existing.pubkey,
      secret: existing.secret,
      services: def.services.map(s => ({
        ...s,
        endpoint: `http://localhost:${def.port}/${s.capability}`,
      })),
    });
  }

  // Persist keypairs
  const toStore: StoredAgent[] = agents.map(a => ({
    name: a.name,
    pubkey: a.pubkey,
    secret: a.secret,
  }));
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(toStore, null, 2));

  return agents;
}
