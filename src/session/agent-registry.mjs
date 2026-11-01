import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

export class AgentRegistry {
  constructor(registryPath = path.resolve(ROOT_DIR, 'agents/registry.json')) {
    this.registryPath = registryPath;
    this.agents = new Map();
    this.load();
  }

  load() {
    if (!fs.existsSync(this.registryPath)) {
      throw new Error(`Agent registry not found at: ${this.registryPath}`);
    }
    const raw = fs.readFileSync(this.registryPath, 'utf8');
    const data = JSON.parse(raw);
    for (const agent of data.agents || []) {
      const fullSystemPromptPath = path.resolve(ROOT_DIR, agent.systemPromptFile);
      const fullCharterPath = path.resolve(ROOT_DIR, agent.agentsCharter);
      this.agents.set(agent.id, {
        ...agent,
        systemPromptPath: fullSystemPromptPath,
        charterPath: fullCharterPath,
      });
    }
  }

  getAgent(id) {
    return this.agents.get(id);
  }

  hasAgent(id) {
    return this.agents.has(id);
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getOrchestrator() {
    return this.getAgent('orchestrator') || this.getAllAgents().find((a) => a.role === 'coordinator');
  }

  getSpecialists() {
    return this.getAllAgents().filter((a) => a.role === 'specialist');
  }
}

export const defaultRegistry = new AgentRegistry();
