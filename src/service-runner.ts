/**
 * Service Runner — Lightweight Express servers that back each agent's capabilities.
 * Each agent gets a port and serves its registered capabilities via Nemotron on OpenRouter.
 */

import express from "express";
import axios from "axios";
import { Agent } from "./agents.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

interface ServiceRunner {
  agent: Agent;
  port: number;
  server: ReturnType<typeof express.prototype.listen>;
}

const AGENT_PERSONAS: Record<string, string> = {
  Atlas:
    "You are Atlas, a concise data analyst. Provide factual, structured responses. Keep answers under 100 words.",
  Sage:
    "You are Sage, a senior software engineer. Review code carefully, identify bugs, suggest improvements. Be direct.",
  Pixel:
    "You are Pixel, a creative AI with encyclopedic knowledge of random facts. Be fun and surprising. Keep it brief.",
  Quant:
    "You are Quant, a quantitative analyst. Provide precise numbers, risk assessments, and market insights. Be terse.",
};

const CAPABILITY_PROMPTS: Record<string, string> = {
  "web-search": "Provide a brief summary of current information about: {query}",
  "news-aggregation": "Summarize the latest developments in: {query}",
  "code-review": "Review this code snippet and provide feedback:\n{query}",
  "bug-analysis": "Analyze this bug report and suggest potential causes:\n{query}",
  "image-gen": "Describe in detail what an image of the following would look like: {query}",
  "style-transfer": "Describe how to transform this visual concept into a different style: {query}",
  "market-data": "Provide current market analysis for: {query}",
  "risk-scoring": "Assess the risk level of the following scenario: {query}",
};

async function callNemo(
  persona: string,
  prompt: string,
  apiKey: string
): Promise<string> {
  try {
    const response = await axios.post(
      OPENROUTER_URL,
      {
        model: MODEL,
        messages: [
          { role: "system", content: persona },
          { role: "user", content: prompt },
        ],
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    const msg = response.data?.choices?.[0]?.message;
    // Nemotron sometimes puts content in reasoning field
    return msg?.content || msg?.reasoning || "No response generated";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return `Error generating response: ${msg}`;
  }
}

export function startServiceRunner(
  agent: Agent,
  port: number,
  apiKey: string
): ServiceRunner {
  const app = express();
  app.use(express.json());

  const persona = AGENT_PERSONAS[agent.name] || "You are a helpful AI assistant.";

  // Create a route for each capability
  for (const service of agent.services) {
    const capabilityPrompt =
      CAPABILITY_PROMPTS[service.capability] ||
      "Respond helpfully to: {query}";

    app.get(`/${service.capability}`, async (req, res) => {
      const query = String(req.query.q || req.query.query || "general inquiry");
      const prompt = capabilityPrompt.replace("{query}", query);

      const start = Date.now();
      const response = await callNemo(persona, prompt, apiKey);
      const latencyMs = Date.now() - start;

      res.json({
        agent: agent.name,
        capability: service.capability,
        query,
        response,
        latencyMs,
        timestamp: new Date().toISOString(),
        model: MODEL,
      });
    });
  }

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      agent: agent.name,
      services: agent.services.map((s) => s.capability),
      status: "ok",
    });
  });

  const server = app.listen(port, () => {
    console.log(
      `[${new Date().toISOString()}] ${agent.name} service runner on port ${port} | capabilities: ${agent.services.map((s) => s.capability).join(", ")}`
    );
  });

  return { agent, port, server };
}

export function stopServiceRunners(runners: ServiceRunner[]): void {
  for (const runner of runners) {
    runner.server.close();
    console.log(`[${new Date().toISOString()}] ${runner.agent.name} service runner stopped`);
  }
}
