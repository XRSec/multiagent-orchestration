/**
 * Purpose: ExtensionRegistryService - Centralized discovery, resolution and persistence
 * for MCP Servers, Skills, and Plugins across Partners and Workspace Folders.
 * Constraints: Node.js 18+ native ESM, single file <= 500 lines.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME_DIR = os.homedir();
const GLOBAL_SKILLS_DIR = path.join(HOME_DIR, '.agents', 'skills');
const GLOBAL_MCP_FILE = path.join(HOME_DIR, '.mcp.json');
const BASE_ORCHESTRATION_DIR = path.join(HOME_DIR, '.multiagent-orchestration');

export class ExtensionRegistryService {
  constructor(options = {}) {
    this.partnerService = options.partnerService || null;
    this.workspaceDir = options.workspaceDir || process.cwd();
  }

  /**
   * 发现系统可用所有 MCP 服务
   */
  getAvailableMcpServers() {
    const builtinMcps = [
      {
        id: 'nexus-orchestrator-mcp',
        name: 'Nexus Orchestrator (In-Process)',
        type: 'in-process',
        description: '任务编排主控 MCP，提供队列分派、异步等待与干预。',
        tools: ['dispatch_and_queue_partners', 'await_partner_queue', 'steer_or_repair_partner']
      },
      {
        id: 'cindy-memory',
        name: 'Cindy Maker Memory',
        type: 'stdio',
        description: '持久化跨会话记忆库，提供向量检索与语义存储。',
        tools: ['memory_read', 'memory_write', 'memory_search', 'memory_consolidate']
      },
      {
        id: 'filesystem',
        name: 'Local Filesystem Provider',
        type: 'builtin',
        description: '提供安全限定内的文件读写与目录树扫描。',
        tools: ['read_file', 'write_file', 'list_directory', 'get_file_info']
      },
      {
        id: 'cindy-github',
        name: 'GitHub Provider MCP',
        type: 'plugin-bridge',
        description: '仓库、PR、Issue 与审查联动能力。',
        tools: ['list_tools', 'call_tool']
      }
    ];

    // 扫描工作区 .mcp.json
    const localMcpFile = path.join(this.workspaceDir, '.mcp.json');
    const customMcps = [];
    if (fs.existsSync(localMcpFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(localMcpFile, 'utf8'));
        const servers = raw.mcpServers || {};
        for (const [key, val] of Object.entries(servers)) {
          customMcps.push({
            id: key,
            name: key,
            type: val.type || (val.command ? 'stdio' : 'sse'),
            description: `配置于本地 .mcp.json 的服务: ${key}`,
            command: val.command,
            args: val.args,
            env: val.env,
            url: val.url,
            tools: val.tools || ['list_tools', 'call_tool']
          });
        }
      } catch (e) {
        console.warn(`[ExtensionRegistry] Parse local .mcp.json failed:`, e.message);
      }
    }

    return [...builtinMcps, ...customMcps];
  }

  /**
   * 发现系统可用所有 Skills
   */
  getAvailableSkills() {
    const builtinSkills = [
      {
        id: 'workflow-authoring',
        name: 'Workflow Authoring',
        category: 'orchestration',
        description: '多 Agent 流水线与分支协同脚本编写规范。',
        triggers: ['workflow', 'orchestration', 'pipeline']
      },
      {
        id: 'task-decomposition',
        name: 'Task Decomposition',
        category: 'planning',
        description: '将复杂大型需求按拓扑依赖拆解为可并发子任务。',
        triggers: ['decompose', 'breakdown', 'plan']
      },
      {
        id: 'architecture-review',
        name: 'Architecture Review',
        category: 'quality',
        description: '代码行数、双平面隔离与依赖单向性审查。',
        triggers: ['architecture', 'review', 'audit']
      },
      {
        id: 'spec-enforcement',
        name: 'Spec Enforcement',
        category: 'standards',
        description: '严格执行 STANDING_ORDER.md 拓扑规范与单文件限额。',
        triggers: ['spec', 'enforce', 'lint']
      },
      {
        id: 'safe-refactoring',
        name: 'Safe Refactoring',
        category: 'engineering',
        description: '基于测试驱动与 AST 的安全重构与零退化演进。',
        triggers: ['refactor', 'clean', 'restructure']
      },
      {
        id: 'unit-testing',
        name: 'Unit Testing',
        category: 'test',
        description: '自动化单元测试与对抗性测试用例生成。',
        triggers: ['test', 'coverage', 'unit-test']
      }
    ];

    // 扫描全局 ~/.agents/skills
    const scannedSkills = [];
    if (fs.existsSync(GLOBAL_SKILLS_DIR)) {
      try {
        const dirs = fs.readdirSync(GLOBAL_SKILLS_DIR, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory()) {
            scannedSkills.push({
              id: d.name,
              name: d.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              category: 'user-global',
              description: `位于 ~/.agents/skills/${d.name} 的自定义技能`,
              triggers: [d.name]
            });
          }
        }
      } catch (e) {
        console.warn(`[ExtensionRegistry] Scan ~/.agents/skills failed:`, e.message);
      }
    }

    return [...builtinSkills, ...scannedSkills];
  }

  /**
   * 发现系统可用 Plugins (Cindy Ghost 扩展)
   */
  getAvailablePlugins() {
    return [
      {
        id: 'cindy-github',
        name: 'GitHub Extension',
        version: '1.2.0',
        author: 'Cindy Core Team',
        description: '支持 PR 评审、分支管理、Issue 互动与 CI 检查。',
        status: 'installed',
        permissions: ['network', 'repo-write']
      },
      {
        id: 'cindy-gitlab',
        name: 'GitLab Extension',
        version: '1.1.0',
        author: 'Cindy Core Team',
        description: '支持自建 GitLab 实例的项目与合并请求审查。',
        status: 'available',
        permissions: ['network']
      },
      {
        id: 'cindy-docs',
        name: 'Docs & PDF Formatter',
        version: '2.0.0',
        author: 'Cindy Studio',
        description: '零依赖生成专业 Word、PPT 与 PDF 交付文档。',
        status: 'installed',
        permissions: ['filesystem-write']
      },
      {
        id: 'cindy-group-history',
        name: 'Group History & Indexer',
        version: '1.0.5',
        author: 'Cindy Brain',
        description: '本地群聊与多模态消息历史检索。',
        status: 'installed',
        permissions: ['read-history']
      }
    ];
  }

  /**
   * 解析伙伴维度的配置
   */
  resolveForPartner(partnerId) {
    if (!this.partnerService) {
      throw new Error('PartnerService 未注入');
    }
    const partner = this.partnerService.getPartner(partnerId);
    if (!partner) {
      throw new Error(`[NOT_FOUND] 伙伴 ${partnerId} 不存在`);
    }

    const caps = partner.capabilities || {};
    return {
      scopeType: 'partner',
      scopeId: partnerId,
      name: partner.name,
      avatar: partner.avatar,
      mcpServers: caps.mcpServers || ['cindy-memory'],
      mcpMode: caps.mcpMode || 'inherit',
      skills: caps.skills || [],
      skillMode: caps.skillMode || 'inherit',
      plugins: caps.plugins || [],
      pluginMode: caps.pluginMode || 'inherit',
      permissions: caps.permissions || 'auto',
      workingDir: caps.workingDir || null
    };
  }

  /**
   * 解析文件夹（工作区）维度的配置
   */
  resolveForFolder(folderPath) {
    const targetDir = folderPath ? path.resolve(folderPath) : this.workspaceDir;
    const configPath = path.join(targetDir, '.multiagent-config.json');

    let folderConfig = {
      scopeType: 'folder',
      scopeId: targetDir,
      name: path.basename(targetDir),
      mcpServers: ['filesystem', 'cindy-memory'],
      mcpMode: 'inherit',
      skills: ['workflow-authoring', 'architecture-review'],
      skillMode: 'inherit',
      plugins: ['cindy-github', 'cindy-docs'],
      pluginMode: 'inherit'
    };

    if (fs.existsSync(configPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        folderConfig = { ...folderConfig, ...raw, scopeId: targetDir };
      } catch (e) {
        console.warn(`[ExtensionRegistry] Parse folder config failed:`, e.message);
      }
    }

    return folderConfig;
  }

  /**
   * 保存伙伴或文件夹维度的配置
   */
  saveConfig(scopeType, scopeId, newConfig) {
    if (scopeType === 'partner') {
      if (!this.partnerService) throw new Error('PartnerService 未注入');
      const partner = this.partnerService.getPartner(scopeId);
      if (!partner) throw new Error(`伙伴 ${scopeId} 不存在`);

      const updatedCaps = {
        ...partner.capabilities,
        mcpServers: Array.isArray(newConfig.mcpServers) ? newConfig.mcpServers : partner.capabilities.mcpServers,
        mcpMode: newConfig.mcpMode || partner.capabilities.mcpMode,
        skills: Array.isArray(newConfig.skills) ? newConfig.skills : partner.capabilities.skills,
        skillMode: newConfig.skillMode || partner.capabilities.skillMode,
        plugins: Array.isArray(newConfig.plugins) ? newConfig.plugins : partner.capabilities.plugins,
        pluginMode: newConfig.pluginMode || partner.capabilities.pluginMode,
        permissions: newConfig.permissions || partner.capabilities.permissions,
        workingDir: newConfig.workingDir !== undefined ? newConfig.workingDir : partner.capabilities.workingDir
      };

      return this.partnerService.updatePartner(scopeId, { capabilities: updatedCaps });
    }

    if (scopeType === 'folder') {
      const targetDir = path.resolve(scopeId || this.workspaceDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const configPath = path.join(targetDir, '.multiagent-config.json');
      const payload = {
        scopeType: 'folder',
        scopeId: targetDir,
        mcpServers: newConfig.mcpServers || [],
        mcpMode: newConfig.mcpMode || 'inherit',
        skills: newConfig.skills || [],
        skillMode: newConfig.skillMode || 'inherit',
        plugins: newConfig.plugins || [],
        pluginMode: newConfig.pluginMode || 'inherit',
        updatedAt: Date.now()
      };
      fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf8');
      return payload;
    }

    throw new Error(`未知的 scopeType: ${scopeType}`);
  }
}
