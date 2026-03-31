# Stellar Agent Mesh — Battle Harness

Autonomous testing harness for [Stellar Agent Mesh](https://github.com/ghost-clio/stellar-agent-mesh). Runs 4 AI agents transacting real Stellar testnet payments across 16 economic scenarios.

This is an **independent test client** — it communicates with the gateway exclusively via HTTP. Zero cross-imports, separate package. Any agent framework could replace it.

## Agents

| Agent | Port | Services | Personality |
|-------|------|----------|-------------|
| **Atlas** | 4001 | Web search, News aggregation | Concise data analyst |
| **Sage** | 4002 | Code review, Bug analysis | Senior engineer |
| **Pixel** | 4003 | Image description, Style transfer | Creative encyclopedist |
| **Quant** | 4004 | Market data, Risk scoring | Quantitative analyst |

Each agent runs real service endpoints powered by Nemotron 120B (free on OpenRouter). When another agent pays for a service, the LLM generates a real response.

## 16 Transaction Patterns

| # | Pattern | Frequency | Tests |
|---|---------|-----------|-------|
| 1 | Normal payment | Every 5 min | Standard x402 buy with ±10% price jitter |
| 2 | $10K rejection | Every 12h | Spending policy enforcement (must reject) |
| 3 | Path payment | Every 8h | Cross-asset routing via Stellar DEX |
| 4 | Chain (A→B→C) | Every 6h | Multi-hop sequential payment |
| 5 | Concurrent burst | Every 4h | 3 simultaneous purchases |
| 6 | MPP session | Every 3h | Full MPP lifecycle (session→pay→verify→receipt) |
| 7 | Federation payment | Every 4h | Pay using `name*mesh.agent` address |
| 8 | Misbehavior | Every 8h | Bad data → reputation penalty → recovery arc |
| 9 | Empty wallet | Daily 3AM | Unfunded agent → graceful failure |
| 10 | Multi-asset | Every 6h | 3 buyers at micro/small/medium amounts |
| 11 | Self-payment | Every 10h | Agent tries to buy own service (edge case) |
| 12 | Wrong address | Every 12h | Payment to stranger + federation miss |
| 13 | 🔥 Stress test | Daily 2AM | 50 transactions in 60 seconds |
| 14 | 🛡️ Malformed proof | Every 8h | Fake tx hash → must reject |
| 15 | 💀 Wallet drain | Daily 4AM | Drain mid-chain → graceful partial failure |
| 16 | 📊 Rep pricing | Every 6h | Compare fresh vs established agent pricing |

## Setup

```bash
# 1. Start the gateway first (separate repo)
# See: https://github.com/ghost-clio/stellar-agent-mesh

# 2. Install harness
npm install

# 3. Configure
cp .env.example .env
# Add your OpenRouter API key (free tier)

# 4. Run continuous harness
npx tsc && node dist/index.js

# Or run a single test cycle
npx tsc && node dist/run-once.js
```

## Persistent Logging

Every transaction is appended to `transactions.jsonl` (JSONL format, survives restarts):

```json
{"ts":"2026-03-31T21:10:00Z","buyer":"Quant","seller":"Atlas","service":"atlas-news","amount":1.33,"success":true,"latencyMs":29974,"txHash":"9b7cc4ce...","type":"payment","protocol":"x402"}
```

## Watchdog

Keep the harness alive across sleep/wake cycles:

```bash
nohup bash watchdog.sh &
```

Checks every 60 seconds, auto-restarts gateway and harness if either dies.

## License

Apache-2.0
