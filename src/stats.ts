import fs from "node:fs";
import path from "node:path";
import { TxResult } from "./scheduler.js";

const TX_LOG_PATH = process.env.TX_LOG_PATH || "./transactions.jsonl";

interface AgentBreakdown {
  txCount: number;
  successCount: number;
  totalSpent: number;
}

interface StatsSnapshot {
  totalTxs: number;
  successRate: number;
  avgLatencyMs: number;
  uptimeMinutes: number;
  perAgent: Record<string, AgentBreakdown>;
  generatedAt: string;
}

export class StatsCollector {
  private allResults: TxResult[] = [];
  private startTime: Date = new Date();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  record(result: TxResult): void {
    this.allResults.push(result);
    // Append to persistent JSONL log (survives restarts)
    this.appendTxLog(result);
  }

  private appendTxLog(result: TxResult): void {
    try {
      const entry = {
        ts: result.timestamp,
        buyer: result.buyer,
        seller: result.seller ?? "",
        service: result.serviceId,
        amount: result.amount,
        success: result.success,
        latencyMs: result.latencyMs,
        txHash: result.stellarTxHash ?? null,
        type: result.type,
        protocol: result.protocol,
        memo: result.memo ?? "",
        error: result.error ?? null,
      };
      fs.appendFileSync(TX_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
    } catch (err) {
      // Don't crash the harness over logging
      console.error(`[${new Date().toISOString()}] Failed to write tx log:`, err);
    }
  }

  /**
   * Load historical tx count from persistent log (for accurate lifetime stats)
   */
  getLifetimeStats(): { total: number; successful: number; failed: number } {
    try {
      if (!fs.existsSync(TX_LOG_PATH)) return { total: 0, successful: 0, failed: 0 };
      const lines = fs.readFileSync(TX_LOG_PATH, "utf-8").trim().split("\n").filter(Boolean);
      let successful = 0;
      let failed = 0;
      for (const line of lines) {
        try {
          const tx = JSON.parse(line);
          if (tx.success) successful++;
          else failed++;
        } catch { /* skip malformed */ }
      }
      return { total: lines.length, successful, failed };
    } catch {
      return { total: 0, successful: 0, failed: 0 };
    }
  }

  getStats(): StatsSnapshot {
    const totalTxs = this.allResults.length;
    const successCount = this.allResults.filter((r) => r.success).length;
    const successRate = totalTxs > 0 ? successCount / totalTxs : 0;
    const avgLatencyMs =
      totalTxs > 0
        ? Math.round(
            this.allResults.reduce((sum, r) => sum + r.latencyMs, 0) / totalTxs
          )
        : 0;

    const uptimeMinutes = Math.round(
      (Date.now() - this.startTime.getTime()) / 60000
    );

    const perAgent: Record<string, AgentBreakdown> = {};
    for (const r of this.allResults) {
      if (!perAgent[r.buyer]) {
        perAgent[r.buyer] = { txCount: 0, successCount: 0, totalSpent: 0 };
      }
      const entry = perAgent[r.buyer];
      entry.txCount++;
      if (r.success) {
        entry.successCount++;
        entry.totalSpent = parseFloat(
          (entry.totalSpent + r.amount).toFixed(4)
        );
      }
    }

    return {
      totalTxs,
      successRate: parseFloat(successRate.toFixed(4)),
      avgLatencyMs,
      uptimeMinutes,
      perAgent,
      generatedAt: new Date().toISOString(),
    };
  }

  startHourlyWrite(outputPath: string): void {
    this.writeStats(outputPath);
    this.intervalHandle = setInterval(() => {
      this.writeStats(outputPath);
    }, 3600000);
  }

  writeStats(outputPath: string): void {
    const stats = this.getStats();
    fs.writeFileSync(outputPath, JSON.stringify(stats, null, 2), "utf-8");
    console.log(
      `[${new Date().toISOString()}] Stats written to ${outputPath} (${stats.totalTxs} txs)`
    );
  }

  stopHourlyWrite(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
